# Pull Request

## Change Type

Select the type of change included in this PR:

* [ ] Bug fix
* [ ] New feature
* [ ] Enhancement
* [ ] Refactoring
* [ ] Documentation
* [ ] Performance improvement
* [ ] Dependency update
* [ ] Other

## Description

Describe the changes in this PR.

<!-- Example: This PR fixes..., adds..., removes..., or updates... -->

## Changelog

Write one concise sentence that should appear in `CHANGELOG.md` after this PR merges. CI requires this section and the merge workflow adds the PR number automatically.

<!-- Example: Fix provider selection so session-only changes never overwrite global configuration. -->

## Motivation and Context

Explain why this change is needed.

Related issue, discussion, or context:

<!-- Example: Closes #123 -->

## Testing

Describe how you tested this change.

* [ ] Added or updated unit tests
* [ ] Ran existing tests
* [ ] Manually tested the affected behavior

Test commands run:

```bash
bun test
bun run lint:check
bun run format:check
bun run build
```

Manual testing notes:

1.
2.
3.

## Screenshots or Recordings

Add screenshots, terminal output, or recordings if this PR changes UI, CLI output, or user-facing behavior.

## Security Checklist

* [ ] This PR does not include API keys, tokens, credentials, or private files.
* [ ] This PR does not log secrets or sensitive user data.
* [ ] File access, command execution, plugin behavior, MCP behavior, or sandbox changes have been reviewed.
* [ ] User-controlled input is validated before use in shell commands, file paths, or network requests.

## Documentation

* [ ] Documentation was updated.
* [ ] Documentation is not needed for this change.

## Contributor Checklist

* [ ] My code follows the project's code style.
* [ ] I have performed a self-review.
* [ ] I have added comments only where the code is hard to understand.
* [ ] My changes generate no new warnings.
* [ ] New and existing tests pass locally.
* [ ] This contribution contains only material I have the right to submit.

## Additional Notes

Add anything reviewers should know.