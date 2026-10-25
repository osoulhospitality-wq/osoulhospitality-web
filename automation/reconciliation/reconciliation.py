"""Pure, offline reconciliation policy. No network, credentials or external writes.

An adapter must atomically claim action_key before executing any returned action.
This module does not claim exactly-once remote delivery; ambiguous outcomes require
provider lookup or manual review, never blind resend.
"""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json

ALLOWED_CHANNELS = {'crm', 'internal_notification'}
STATES = {'pending', 'failed_retryable', 'failed_permanent', 'unknown', 'delivered'}
MAX_ATTEMPTS = 4
BACKOFF_SECONDS = (60, 300, 1800, 7200)

def decision(event, now=None):
    now = now or datetime.now(timezone.utc)
    required = ('organization_id', 'submission_id', 'channel', 'state', 'owner_id')
    missing = [k for k in required if not isinstance(event.get(k), str) or not event[k].strip()]
    if missing:
        return {'action':'quarantine', 'reason':'missing_fields', 'fields':missing}
    channel = event['channel']
    if channel not in ALLOWED_CHANNELS:
        return {'action':'approval_required', 'reason':'external_channel_not_authorized'}
    if event['state'] not in STATES:
        return {'action':'quarantine', 'reason':'invalid_state'}
    if event.get('test_mode') is not True:
        return {'action':'blocked', 'reason':'production_adapter_not_enabled'}
    if not event['submission_id'].startswith('TEST-'):
        return {'action':'blocked', 'reason':'non_test_record'}
    attempts=event.get('attempts',0)
    if isinstance(attempts,bool) or not isinstance(attempts,int) or attempts<0:
        return {'action':'quarantine','reason':'invalid_attempts'}
    version=event.get('version',1)
    if isinstance(version,bool) or not isinstance(version,int) or version<1:
        return {'action':'quarantine','reason':'invalid_version'}
    # JSON preserves field boundaries even when an identifier includes '|'.
    canonical=json.dumps([event['organization_id'],event['submission_id'],channel,version],
                         ensure_ascii=False,separators=(',',':'))
    key=sha256(canonical.encode('utf-8')).hexdigest()
    base={'action_key':key,'owner_id':event['owner_id'],'organization_id':event['organization_id']}
    if event.get('already_claimed') or event['state']=='delivered':
        return dict(base,action='skip',reason='claimed_or_delivered')
    if event['state']=='unknown':
        return dict(base,action='reconcile_provider',reason='delivery_ambiguous_do_not_resend')
    if event['state']=='failed_permanent' or attempts>=MAX_ATTEMPTS:
        return dict(base,action='escalate',reason='permanent_or_retry_limit')
    if event.get('next_attempt_at'):
        try:
            due=datetime.fromisoformat(event['next_attempt_at'].replace('Z','+00:00'))
            if due.tzinfo is None:raise ValueError('timezone required')
        except (ValueError,TypeError,AttributeError):
            return dict(base,action='quarantine',reason='invalid_due_time')
        if now<due:return dict(base,action='wait',reason='backoff_not_elapsed',due=due.isoformat())
    return dict(base,action='simulate_delivery',reason='test_only',attempt=attempts+1,
                next_attempt_at=(now+timedelta(seconds=BACKOFF_SECONDS[attempts])).isoformat())
