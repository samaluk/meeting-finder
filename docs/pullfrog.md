# Pullfrog review and auto-merge

The [Pullfrog workflow](../.github/workflows/pullfrog.yml) follows the app-dispatched setup in `samaluk/flip-x` and `samaluk/community`. The GitHub App receives PR events and dispatches this workflow with a prompt and run name. The workflow deliberately has no `pull_request`, `pull_request_target`, or `pull_request_review` trigger: adding those would not replace the app's automation settings.

The job runs on GitHub-hosted Linux, checks out the repository without persisted Git credentials, and installs the tools pinned in `mise.toml`, including Bun. Pullfrog receives the dispatch prompt unchanged, reads the repository's `AGENTS.md`, and obtains short-lived app credentials through job-level OIDC. Its GitHub token has only repository read access; review and merge operations use Pullfrog's app credentials. Unlike the references' floating `v0` tag, the action is pinned to that tag's inspected commit to satisfy this repository's workflow lint policy. The job has a 70-minute limit around Pullfrog's default one-hour agent timeout. The existing `Check` workflow remains the independent validation gate and runs `mise run check` plus the secret scan.

Neither reference repository has a separate versioned Pullfrog configuration file. Automatic review, approval checks, and auto-merge are Pullfrog service settings, not workflow inputs. Adding this workflow alone does not enable them or change GitHub repository settings.

## Activation checklist

1. Include `samaluk/meeting-finder` in the Pullfrog GitHub App's repository access, then open the [repository console](https://pullfrog.com/console/samaluk?repo=meeting-finder). The installed `pullfrog init` command checks app access and opens the browser to finish setup; it does not generate a local workflow. Use the workflow in this repository rather than creating a second one in the console.
2. After this PR is reviewed and merged by a maintainer, verify `.github/workflows/pullfrog.yml` is on `main`. GitHub only accepts workflow dispatches once the workflow exists on the default branch. The setup PR cannot rely on its newly added workflow to review itself.
3. In Pullfrog, enable the settings below to match both references. They are configurable from the installed CLI once app access works, but are intentionally not changed by this PR:

   ```sh
   pullfrog config set enabled true -R samaluk/meeting-finder
   pullfrog config set review.mode agent -R samaluk/meeting-finder
   pullfrog config set review.non-collaborators true -R samaluk/meeting-finder
   pullfrog config set review.re-review true -R samaluk/meeting-finder
   pullfrog config set review.approve true -R samaluk/meeting-finder
   pullfrog config set review.drafts true -R samaluk/meeting-finder
   pullfrog config set review.own-prs true -R samaluk/meeting-finder
   pullfrog config set review.status-check true -R samaluk/meeting-finder
   pullfrog config set review.approval-check true -R samaluk/meeting-finder
   pullfrog config set auto-merge true --yes --ack-auto-merge -R samaluk/meeting-finder
   ```

4. Select a funded model and confirm credential access with `pullfrog config list -R samaluk/meeting-finder` and `pullfrog secret list -R samaluk/meeting-finder`. Both references inherit `OPENCODE_API_KEY` and `CODEX_AUTH_JSON` from the `samaluk` Pullfrog account. `flip-x` inherits `opencode/big-pickle`; `community` overrides the model to `openai/gpt-sol`. Reuse an existing appropriate account credential after verifying inheritance; do not copy credentials into the repository. The workflow follows `community` and needs no GitHub Actions provider secrets when Pullfrog supplies credentials. The Convex secrets in `flip-x` are unrelated.
5. In GitHub **Settings → General → Pull Requests**, enable **Allow auto-merge**. Both references enable it. They also allow only squash merges and automatically delete merged branches; those are separate policy choices, not prerequisites for this workflow.
6. Add an active branch ruleset targeting `main` (or the default branch). Require a pull request, resolved review conversations, and these exact checks:
   - `check` from GitHub Actions (the job in the workflow named `Check`).
   - `pullfrog-approval` from the Pullfrog app (app ID `1768019` in both references).

   Do not copy the references' application-specific CI check names. Wait for a subsequent PR's Pullfrog review to publish the approval check if GitHub's picker does not offer it yet. `community` requires zero approving reviews and gates on `pullfrog-approval`; `flip-x` additionally requires one approving review. Choose the review-count policy deliberately. Without required checks, requesting auto-merge can merge immediately rather than waiting for CI. Do not grant the bot a ruleset bypass that defeats these gates.

## Verify without changing settings

```sh
gh api repos/samaluk/meeting-finder --jq '{allow_auto_merge, permissions}'
gh secret list -R samaluk/meeting-finder
gh api repos/samaluk/meeting-finder/rules/branches/main
pullfrog config list -R samaluk/meeting-finder
pullfrog secret list -R samaluk/meeting-finder
```

Once activation is complete, open a subsequent PR and confirm that Pullfrog dispatches a review, publishes its verdict, and requests auto-merge only after approval. GitHub must still wait for `check`, `pullfrog-approval`, and the chosen branch rules before merging. This setup PR is not merged or enrolled in auto-merge by the implementation task.
