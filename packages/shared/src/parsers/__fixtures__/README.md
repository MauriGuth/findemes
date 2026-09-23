# Parser fixtures

Real notifications only, anonymized (CLAUDE.md): amounts and merchants stay; names of
people, CBU/CVU, aliases and account numbers never; last 4 digits masked as `****`.

One folder per `Source.slug`. Each case is two files:

- `<case>.txt`: the text exactly as `notificationText()` builds it (title, then body, then subText, one per line).
- `<case>.expected.json`: the expected `parseNotification()` result without `templateId`, plus
  `"template": "<name>"`; or `{ "template": null }` when the notification is not a movement.
