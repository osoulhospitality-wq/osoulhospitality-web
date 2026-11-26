const english = document.documentElement.lang.startsWith("en");

export function uiText(arabic, englishText) {
  return english ? englishText : arabic;
}
