# Upload and publishing workflow

Publishing is integrated after editing but remains a separate state transition.

## Preconditions

- Task stage is `final_ready`.
- Final video exists and full-decode QA passed.
- Title, description, topics or tags, and required cover assets exist.
- Any required prediction is linked.
- The platform account is checked in the current environment.
- The manifest identifies one task, one platform, and one final video.

## Modes

`Prepare` automatically uploads the final video and cover, fills copy and topics, then stops before final submission. It is the default for ordinary upload requests.

`Publish` submits automatically only when the current user request explicitly authorizes real publishing. Manifest approval and the command confirmation switch must both pass. Public Bilibili submission requires the additional public-publish confirmation.

Earlier permission, a `final_ready` state, a schedule value, or a successful upload does not authorize submission.

## Platform invariants

- Try the approved final video first. Transcode only after an explicit request or an observed platform rejection.
- One attempt uses one persistent browser session and one upload.
- On selector failure, timeout, unexpected redirect, or apparent automatic submission, preserve the page and evidence, record uncertainty, and stop. Do not close and re-upload.
- A redirect alone is not proof of publication. Verify the work in platform management when possible.
- Record `published_id`, `published_url`, visibility, timestamp, or an explicit unknown state.
- Credentials and browser data remain outside Git.

## Commands

```powershell
.\scripts\Invoke-DouyinPublish.ps1 -Manifest <douyin.json> -Action Prepare
.\scripts\Set-PublishApproval.ps1 -Manifest <douyin.json> -Approve
.\scripts\Invoke-DouyinPublish.ps1 -Manifest <douyin.json> -Action Publish -ConfirmPublish
.\scripts\Set-PublishApproval.ps1 -Manifest <bilibili.json> -Approve
.\scripts\Invoke-BilibiliPublish.ps1 -Manifest <bilibili.json> -Action Publish -ConfirmPublish
.\scripts\Invoke-BilibiliPublish.ps1 -Manifest <bilibili.json> -Action Publish -ConfirmPublish -ConfirmPublicPublish
```

Use `Set-PublishApproval.ps1 -Revoke` to return a manifest to draft state. Approval never replaces the current explicit user authorization required for a real submission.
