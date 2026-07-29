# Media Upload Policies

Hybrid-Static-CMS can limit media uploads by file size, site storage, user storage, and user role. Quotas are disabled by default so existing installations keep their previous behavior.

## Environment variables

- `MAX_UPLOAD_BYTES`: hard upper limit for one file. The default is `20971520` (20 MB).
- `MEDIA_SITE_QUOTA_BYTES`: total media storage quota for the installation. `0` means unlimited.
- `MEDIA_USER_QUOTA_BYTES`: default storage quota for each uploader. `0` means unlimited.
- `MEDIA_UPLOAD_ALLOWED_ROLES`: comma-separated roles allowed to upload. The default is `owner,admin,editor,author`.
- `MEDIA_ROLE_QUOTA_BYTES`: optional per-role storage quota overrides.
- `MEDIA_ROLE_MAX_UPLOAD_BYTES`: optional per-role per-file limit overrides.

Role limits use `role:bytes` entries separated by commas or pipes:

```dotenv
MEDIA_SITE_QUOTA_BYTES=10737418240
MEDIA_USER_QUOTA_BYTES=536870912
MEDIA_UPLOAD_ALLOWED_ROLES=owner,admin,editor,author
MEDIA_ROLE_QUOTA_BYTES=owner:0,admin:2147483648,editor:1073741824,author:268435456
MEDIA_ROLE_MAX_UPLOAD_BYTES=owner:20971520,admin:20971520,editor:10485760,author:5242880
```

An explicit role quota of `0` means unlimited. A missing role entry inherits `MEDIA_USER_QUOTA_BYTES`. A role-specific per-file limit cannot exceed `MAX_UPLOAD_BYTES`.

## Multiple roles

Users with multiple roles receive the most permissive applicable role quota and role file-size limit. An unlimited role quota therefore overrides a finite role quota. The installation-wide `MAX_UPLOAD_BYTES` and `MEDIA_SITE_QUOTA_BYTES` remain hard ceilings.

Upload permission still requires at least one role listed in `MEDIA_UPLOAD_ALLOWED_ROLES` and the existing `media.write` application permission.

## Usage calculation and concurrency

The control panel calculates usage from `media_files.size_bytes` in PostgreSQL. Uploads use a PostgreSQL transaction and an advisory transaction lock so concurrent requests cannot independently pass the same remaining-quota check.

The media file is removed if its database transaction fails. Files placed manually in `CMS_UPLOAD_DIR` are not included in quota usage because they do not have a `media_files` record. Operators should avoid manual writes there and should monitor for filesystem/database drift during backups or incident recovery.

Configuration is loaded when the Bun process starts. Restart the application after changing these variables.
