# Repository rules

- Use `START_HERE.md` for current state and `SKILL.md` for runtime routing.
- Keep content, editing, and publishing as separate modules connected by job state.
- The current default is no visual motion; motion requires an explicit request for the current job.
- Preserve source media and a single active final output.
- Do not treat upload, schedule, redirect, or an earlier approval as current permission to publish.
- Code comments must remain bilingual in Chinese and English.
- Do not add private media, account data, credentials, browser state, local production paths, or generated task data.
- Run `tests/Test-Workflow.ps1`, Skill validation, TypeScript typecheck, dependency audit, and a tracked-file privacy scan before release.
