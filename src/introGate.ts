/* First-run intro gate policy.
 *
 * The How-to-Play gate is shown only to a genuinely new visitor: someone with no
 * restorable save AND who has never dismissed the gate before. Returning players
 * — mid-run or not — reach the guide through the end screen's How to Play tab
 * instead, so we never nag them. */

export function shouldShowIntro(hasSave: boolean, hasSeenIntro: boolean): boolean {
  return !hasSave && !hasSeenIntro;
}
