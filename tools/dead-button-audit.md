# Dead-Button & Stub-Screen Audit — Phase 2 Prep

**Date:** 2026-05-21
**Scope:** `client/screens/*` (ConversationScreen explicitly excluded — known good).
**Method:** Static audit via explore subagent for empty `onPress`, comment-only callbacks, `Alert.alert("Coming soon")`-style placeholders, and screens that render nothing or a placeholder.

## Findings

### Stub screens

| File | Line | Issue | Triage |
|---|---|---|---|
| `client/screens/HomeScreen.tsx` | 14 | Renders `FlatList` with `data={[]}` and `renderItem={() => null}`. Completely empty placeholder. Reachable through `HomeStackNavigator.tsx:20`. | **Fix in Phase 2** if HomeScreen is reachable through the tab bar / drawer. **Or remove from the navigator** if it's a leftover from the template. Decision: confirm whether any nav path lands here in current builds — if not, delete the file + remove from `HomeStackNavigator`. |
| `client/screens/ModalScreen.tsx` | 14 | Empty `ScrollView`, no content, no interactions. | **Fix in Phase 2** by deletion. Likely template leftover; no production code path opens it. Confirm by grepping for `navigate("Modal"` and `navigate('Modal'` before deleting. |

### Dead / questionable buttons

| File | Line | Element | Note | Triage |
|---|---|---|---|---|
| `client/screens/ProfileScreen.tsx` | 453 | Menu-item `Pressable` uses `onPress={disabled ? undefined : onPress}` | This is a deliberate "disabled state" pattern, not a stub. Items that are `disabled` look greyed out and don't fire. Not a dead button — but worth verifying that no menu item is permanently `disabled` with no path to enable. | **Verify** in Phase 2: walk every consumer of this menu component, list each `disabled` site, confirm there is a path to undisable. If any is permanently disabled, either remove the row or make the disabled state actionable (tooltip / VIP upsell / etc). |
| `client/navigation/HomeStackNavigator.tsx` | 20 | Points at the stub `HomeScreen` above. | Same disposition as the HomeScreen entry. | See HomeScreen row. |

### No findings (positive signal)
- No `Alert.alert("Coming soon")` callbacks anywhere.
- No `onPress={() => {}}` literal callbacks anywhere.
- Settings screens, profile screens, security screens, status/stories screens, conversation flows, and call flows all use real `navigation.navigate(...)` or real handler functions.
- The audit confirms the project is much further along than a typical "fix the dead buttons" sweep would assume.

## Decisions for Phase 2

1. **Delete `HomeScreen.tsx` + `ModalScreen.tsx` + remove `HomeStackNavigator` references** — pending grep confirmation that nothing actually navigates there. If something does, repurpose the screen instead of deleting.
2. **Audit `ProfileScreen` menu items** for permanently-disabled rows. If any are dead, remove or convert into an upsell.
3. Ship as part of build 62. Low effort, in-scope.

## Items requiring explicit scheduling

None. The findings are small enough to fold into Phase 2.

## Out of scope for this audit
- `ConversationScreen.tsx` — explicitly excluded.
- `App.tsx` / `MainApp.tsx` — not screens.
- Modal sheets and bottom sheets inside screens — these are sub-components; if they were dead, the host screen audit would have caught them.
- Web-only routes — the audit is mobile-first; web fallbacks are acceptable to differ.
