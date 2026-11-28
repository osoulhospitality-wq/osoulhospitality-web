import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import vm from "node:vm";

const root = new URL("../../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const shared = read("field-forms/app.bundle.js");
// The field release currently ships the template catalogue inside its browser bundle.
const templateStart = shared.indexOf("var jn=") + "var jn=".length;
const templateEnd = shared.indexOf(";window.OsoulFieldEnglish?.localizeTemplates(jn)", templateStart);
assert.ok(templateStart > 7 && templateEnd > templateStart);
const original = vm.runInNewContext(shared.slice(templateStart, templateEnd), {});
const window = {};
function Option(label, value) { this.label = label; this.value = value; }
const document = {createElement: () => ({
  options: [],
  append(...options) { this.options.push(...options); },
  add(option) { this.options.push(option); }
})};
vm.runInNewContext(read("field-forms/locale-en.js"), {window, document, Option});
const english = window.OsoulFieldEnglish;
const arabic = /[\u0600-\u06ff]/;

test("English covers each released form, field and hint and preserves calculation and storage keys", () => {
  const translated = structuredClone(original);
  english.localizeTemplates(translated);
  assert.equal(translated.length, 28);
  translated.forEach((form, index) => {
    const source = original[index];
    assert.equal(form.code, source.code);
    for (const label of [form.name, form.owner, form.frequency]) {
      assert.ok(label && !arabic.test(label), form.code + " " + label);
    }
    assert.equal(form.fields.length, source.fields.length);
    for (const [position, field] of form.fields.entries()) {
      const raw = source.fields[position];
      assert.ok(field.label && !arabic.test(field.label), form.code + "/" + field.key);
      if (raw.hint) assert.ok(field.hint && !arabic.test(field.hint));
      assert.equal(field.key, raw.key);
      assert.equal(field.formula, raw.formula);
      assert.equal(field.numeric, raw.numeric);
      assert.equal(field.percent, raw.percent);
    }
  });
});

test("safety choices preserve canonical values, read-only decisions and pre-existing answers", () => {
  for (const [code, key] of [["F04", "C12"], ["F17", "C15"]]) {
    const control = english.booleanControl(code, key, false, "قيمة محفوظة");
    assert.equal(control.disabled, true);
    assert.deepEqual(control.options.map(o => [o.label, o.value]), [
      ["Select an answer", ""], ["Yes", "نعم"], ["No", "لا"], ["قيمة محفوظة", "قيمة محفوظة"]
    ]);
    assert.equal(english.booleanControl(code, key, true, "").disabled, false);
  }
  assert.equal(english.booleanControl("F08", "C12", true, "ملاحظة"), null);
});

test("both language routes load the same authenticated runtime and current field asset revisions", () => {
  for (const locale of ["ar", "en"]) {
    const html = read((locale === "ar" ? "" : "en/") + "field-forms/index.html");
    assert.ok(html.includes('lang="' + locale + '" dir="' + (locale === "ar" ? "rtl" : "ltr") + '"'));
    const assets = new Map([...html.matchAll(/(?:src|href)="(?:\.\/|\/field-forms\/)([^"?]+)\?v=(\w+)"/g)]
      .map(([,name,hash]) => [name, hash]));
    const expected = ["forms.css", "workspace-title.js", "asset-scan.js", "shift-desk.js", "app.bundle.js"];
    if (locale === "en") expected.push("locale-en.js");
    for (const name of expected) {
      assert.equal(assets.get(name), createHash("sha256").update(read("field-forms/" + name)).digest("hex").slice(0, 16), name);
    }
    assert.equal(html.includes("locale-en.js"), locale === "en");
  }
  for (const portal of ["en/login/index.html", "en/command-center/enterprise/index.html"]) {
    const html = read(portal);
    assert.match(html, /href="\/en\/field-forms\/"/);
    assert.match(html, /href="\/en\/field-forms\/#decisions"/);
  }
});
