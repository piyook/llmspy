# Projects

Put `/@<project>` in front of the prefix to give an app's calls their own tab in the UI. The tag is not forwarded:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8080/@my-app/anthropic
```

![Project tabs under the header: general, site-agent (selected, its calls listed) and support-bot with a badge for two new calls](/screenshots/projects.png)

- Calls without a tag go to `general`.
- A project name is lowercase letters, digits and dashes.
- The tabs appear once there is a project besides `general`, and a tab you are not viewing counts its new calls.
- A search looks in every project; while it is on, each tab counts its matches instead.
- Clear All empties only the project you are viewing.

It works the same with any upstream: `http://127.0.0.1:8080/@my-app/openai/v1`, `http://127.0.0.1:8080/@my-app/openrouter`.
