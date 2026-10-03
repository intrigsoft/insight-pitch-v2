import { expect, test } from "@playwright/test";
import { leftoverScript } from "../src/lib/script-check";

// The instant part of the translation check: words left in the source script.
test("flags source-script words left in a translation, and allows names, numbers and Latin terms", () => {
  const tamil = "மொத்தச் செலவு 85 மில்லியன் ரூபாய்.";
  expect(leftoverScript(tamil, "මුළු පිරිවැය 85 மில்லியன் ரூபாய්.", "si")).not.toBeNull();
  expect(leftoverScript(tamil, "මුළු වියදම රුපියල් මිලියන 85 කි.", "si")).toBeNull();
  expect(leftoverScript("ශ්‍රී ලංකා රෝහල", "Sri Lanka ரோஹல hospital", "en")).toBeNull();
  expect(leftoverScript("ශ්‍රී ලංකා රෝහල", "Sri Lanka රෝහල hospital", "en")).not.toBeNull();
  expect(leftoverScript("Insight Pitch uses 4G and 5 km routes", "Insight Pitch 4G සහ 5 km මාර්ග භාවිතා කරයි", "si")).toBeNull();
});
