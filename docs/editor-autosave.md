# Editor Autosave and Recovery

Post and fixed-page editors automatically store a private recovery copy in PostgreSQL after two seconds without input. The canonical post or page is not changed until the user selects the normal save or publish action.

## Recovery behavior

- Autosaves belong to the signed-in user and cannot be read by another user.
- New-content editors keep a generated recovery key in the `autosave` URL query so browser reloads and restored tabs reopen the same copy.
- Existing content uses a key based on its content type and database ID.
- Returning to an editor with a recovery copy displays explicit **Restore autosave** and **Discard autosave** actions.
- Recovery never publishes content automatically.
- If the canonical item changed after the recovery copy was created, the editor shows a conflict warning. The user must review the restored values before saving.
- A successful normal save removes that user's corresponding recovery copy.

The recovery payload covers editor text, grouping, publication settings, presentation, and SEO controls. File uploads are not duplicated into autosave storage; uploaded files remain managed by the media library.

## Retention and limits

Autosaves are stored in `editor_autosaves` through migration `026_editor_autosaves.sql`.

- each payload is limited to 2 MB
- only known post or page fields are accepted
- individual text fields are bounded
- recovery copies older than 30 days are removed by scheduled housekeeping
- CSRF and normal post/page write permissions protect the autosave endpoints

Autosave is a crash-recovery aid, not a substitute for normal saves, revision history, PostgreSQL backups, or file snapshots.
