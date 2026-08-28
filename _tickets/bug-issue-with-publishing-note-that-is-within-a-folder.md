---
session_ids: [{"a": "claude", "type": "execution", "id": "ac2ccab6-ca77-45a4-924b-803aa7e379bf"}]
working_dir: nickolay-kondratyev_markdown-publish-root
id: nid_lgerk1snh3a2i8p8p8sangu84_e
title: "BUG - issue with publishing note that is within a folder"
status: in_progress
deps: []
links: []
created_iso: 2026-08-28T22:02:58Z
status_updated_iso: 2026-08-28T22:06:28Z
type: task
priority: 3
assignee: nickolaykondratyev
tags: []
---

Issue publishing notes that have the folder with exact same name.

For example when there is a note that is referencing:
```
by [[Alan-Watts]] on praise & blame. To highlight:
```

Clicking on `[[Alan-Watts]]` did not lead to the note `/p/Alan-Watts/Alan-Watts.md` with id `e33wd60mupdafm8n2p9v4as` instead it led to this URL https://glassthought.com/alan-watts and resulted in 404.

I am suspecting this is due to `/p/Alan-Watts/Alan-Watts` the folder and the note having the same name. 

Reproduce in test data, ROOT CAUSE And fix.