# Remove Application Profiles Design

## Goal

Remove the obsolete application-level profile system entirely and make first-run onboarding render `WelcomeV2` instead of the profile-aware `LogoV2`.

## Scope

- Replace the onboarding header with `WelcomeV2`.
- Remove `ClewProfile`, `profile`, and `lastProfileModes` from runtime state and settings validation.
- Strip legacy persisted `profile` fields during settings loading so upgrades do not fail.
- Replace profile prompt selection with one standard coding system prompt.
- Remove the personal system prompt, `personalPersonaName`, personal-only footer/profile indicators, and the personal-only bundled delegate skill.
- Remove `isPersonal` props and branches from `LogoV2`, `CondensedLogo`, and `Messages`.
- Update affected tests and documentation.

## Explicit Non-Goal

Do not remove `MemoryScope = 'personal' | 'team'`. In that subsystem, `personal` means private user memory and is unrelated to the removed application profile.

OAuth user profiles, terminal profiles, provider profiles, and CPU profiling are also unrelated and remain unchanged.

## Architecture and Data Flow

`WelcomeV2` becomes the first-run onboarding header directly in `Onboarding.tsx`. The normal REPL continues to render `LogoV2`, now as one standard Clew Code presentation with no profile prop.

At startup, settings parsing removes any legacy `profile` key before Zod validation. Runtime state and exported settings expose no application-profile field, preventing new profile state from being created.

`QueryEngine` appends one standard coding guidance prompt without selecting a profile. Personal delegation and persona presentation paths are deleted.

## Compatibility

Existing users with either `profile: 'personal'` or `profile: 'coding'` must not encounter a settings validation or startup error. The obsolete key is removed at the settings boundary. Other unknown settings continue to follow existing validation behavior.

## Tests

- Verify legacy personal and coding profile fields are stripped.
- Verify standard coding guidance has no profile language.
- Verify onboarding references `WelcomeV2`, not `LogoV2`.
- Run Biome, shadow-pair guard, TypeScript baseline comparison, and the full Bun test suite.

## Success Criteria

- No application-profile runtime state, settings schema, prompt branch, persona UI, profile-aware logo prop, or personal-only skill remains.
- `WelcomeV2` appears during first-run onboarding.
- The regular REPL still displays standard `LogoV2`.
- Legacy profile settings load without failure and are absent from effective settings.
- Private/personal memory scope remains unchanged.
