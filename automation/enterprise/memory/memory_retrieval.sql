-- Role and clearance come from memberships. actor_id is bound by the trusted server.
-- Apply access and lifecycle predicates before lexical/vector ranking or model access.
WITH candidate AS (
 SELECT k.*, row_number() OVER (
   PARTITION BY k.tenant_id,k.record_id ORDER BY k.version DESC
 ) AS edition
 FROM knowledge_record k
 WHERE k.tenant_id=:tenant_id
 AND k.status IN ('approved','withdrawn')
 AND k.effective_at<=:as_of AND k.source_at<=:as_of
)
SELECT k.tenant_id,k.record_id,k.version,k.source_uri,k.source_at,k.checksum,k.body
FROM candidate k
WHERE k.edition=1 AND k.status='approved' AND k.category=:category
AND (k.site_id IS NULL OR k.site_id=:site_id)
AND (k.effective_until IS NULL OR k.effective_until>:as_of)
AND (k.disposition_at IS NULL OR k.disposition_at>:as_of)
AND k.review_due>:as_of
AND EXISTS (
 SELECT 1 FROM trusted_actor_site m JOIN record_role r ON r.role=m.role
 WHERE m.actor_id=:actor_id AND m.tenant_id=k.tenant_id AND m.site_id=:site_id
 AND m.clearance>=k.sensitivity
 AND r.tenant_id=k.tenant_id AND r.record_id=k.record_id AND r.version=k.version
)
ORDER BY k.record_id;

