# Contributing to Insight Pitch

Thanks for helping. Insight Pitch is a tool for public decisions, so changes are judged first by whether they keep
it fair, understandable and trustworthy for the people using it.

## Ways to help

- **Report a bug or suggest a change**: open an issue. Say what you did, what you expected and what happened.
- **Review translations**: the Sinhala (`app/src/i18n/si.ts`) and Tamil (`app/src/i18n/ta.ts`) interface strings
  were machine-translated and need native speakers to check them. Edit the file directly; `npm run i18n:translate`
  only fills in missing keys, so your edits are kept.
- **Extend the moderation word list**: `app/src/lib/romanised-profanity.ts` lists unambiguous Singlish and Tanglish
  swear words. Add exact forms only, so names and ordinary words don't match.
- **Write code**: pick an open issue, or open one first for anything larger than a small fix so we can agree on the
  approach before you spend time on it.

Security problems don't belong in public issues; see [SECURITY.md](SECURITY.md).

## Set up

Follow [Run it locally](README.md#run-it-locally) in the README. You don't need Jev or OpenAI keys to work on most
of the app: without them, proposals publish with the author's scores, comments post without the AI check, and the
tests that need the APIs skip themselves.

`app/` uses Next.js 16, which differs from older versions. Check the guides in `app/node_modules/next/dist/docs/`
before relying on what you remember about Next.js.

## Making a change

1. Fork the repository and branch from `main`.
2. Keep the change focused. If you change `app/src/db/schema.ts`, run `npm run db:generate` and commit the
   generated migration.
3. Interface text goes in `app/src/i18n/en.ts`, never inline, so it can be translated.
4. Run the checks in `app/`:

   ```bash
   npx tsc --noEmit
   npx eslint .
   npm run test:e2e
   ```

   Add or update Playwright tests in `app/tests/` for behaviour you change.
5. Write commit messages as a short sentence in the imperative ("Add …", "Fix …"), like the existing history.
6. Open a pull request against `main` explaining what changed and why. CI runs the build and tests on it.

Changes to how scores, moderation, insights or the mandate are decided affect what people see about each other's
proposals, so explain the reasoning in the pull request and update the decisions in [PLAN.md](PLAN.md).

## License

By contributing, you agree that your contributions are licensed under the
[GNU Affero General Public License v3.0 or later](LICENSE), the same license as the project.

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
