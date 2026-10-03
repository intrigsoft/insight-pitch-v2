// Backstop for strong swear words in romanised Sinhala and Tamil (Singlish, Tanglish). Jev catches most insults once
// the text is converted to Sinhala or Tamil script, but single slang words are often converted wrongly, so these are
// flagged outright. Only unambiguous words are listed: words that also have innocent meanings ("kari" is curry in
// Tamil, "badu" is goods in Sinhala) are left to Jev and to reader flags. Extend this list as moderators find new ones.
const PATTERNS: RegExp[] = [
  // Sinhala
  // Exact word forms only: "Hukam" (an order) and the name "Hutton" must not match.
  /\bhuk(a|ana|anawa|anawada|anna|anne|anni|apan|ahan|apu|ala|agena|uwa|uwe)\b/i,
  /\bhu(th|t)(th|t)?(a|i|o|e)(ge|ta|la|yo|ya|ek)?\b/i,
  /\bpak(a|aya|ayo|ayek|ayala)\b/i,
  /\bkar(iya|iyo|iyek|iyala)\b/i,
  /\bponn(a|aya|ayo|ayek|ayala)\b/i,
  /\b[wv]esi(ge|ya|yo|yak|yage)?\b/i,
  // Tamil
  /\b(otha|oththa|ommala|ommale|ommaala)\b/i,
  /\bthe?y?v[ia]?d(i|e)?y(a|aa|al)\w*/i,
  /\bpund(a|ai|e)\b/i,
  /\bkoo?thi\b/i,
  /\bbaadu\b/i,
  /\b(mayiru|mairu)\b/i,
];

export function hasRomanisedProfanity(text: string) {
  return PATTERNS.some((re) => re.test(text));
}
