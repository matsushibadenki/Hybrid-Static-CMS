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

The control panel calculates usage from original `media_files.size_bytes` values and every `media_variants.size_bytes` value in PostgreSQL. Uploads use a PostgreSQL transaction and an advisory transaction lock so concurrent requests cannot independently pass the same remaining-quota check. Generated display, thumbnail, WebP, and AVIF files therefore count toward both site and uploader quotas.

The media file is removed if its database transaction fails. Files placed manually in `CMS_UPLOAD_DIR` are not included in quota usage because they do not have a `media_files` record. Operators should avoid manual writes there and should monitor for filesystem/database drift during backups or incident recovery.

Configuration is loaded when the Bun process starts. Restart the application after changing these variables.

## Content inspection and stored names

New uploads are checked beyond the browser-supplied MIME type:

- common images must contain both their expected header and container terminator
- RIFF/WebP size metadata and key container identifiers are checked
- MP4/M4A, WebM, OGG, WAV, MP3, and PDF headers are checked at their expected positions
- PDFs containing JavaScript, launch actions, embedded files, rich media, or XFA are rejected
- SVG remains disabled by default and is sanitized when explicitly enabled

The public stored extension is always derived from the accepted MIME type. For example, a file named `payload.html` that contains an accepted PNG is stored with a `.png` extension. The original name remains visible as metadata, but it cannot control how the public web server interprets the stored file.

PDF active-content inspection is a defensive parser-independent check, not a complete antivirus engine. Installations accepting untrusted public uploads should still add malware scanning, quarantine, and isolated object storage before making those uploads public.

Existing media records are not renamed automatically because generated posts and hand-written pages may already reference their URLs. Operators should review legacy files separately before an upgrade if uploads were previously accepted from untrusted users.

## Unused media cleanup

The media library labels each record as `Used` or `Unused` and can filter by
that state. Reference detection checks:

- post and fixed-page Markdown, HTML, and OG image fields
- reusable block HTML
- menu item URLs
- form descriptions and success messages
- post and page revision snapshots
- text-based files under `public_html`, excluding `cms/uploads`

Operators with `media.delete` permission can select unused records and delete
them as a batch. The server repeats reference detection immediately before
each deletion. If a reference was added after the media page loaded, that
record is skipped rather than deleted. Individual deletion uses the same
protection and rejects referenced media.

Revision snapshots intentionally count as references. Removing a media file
used only by an old revision would make that revision incomplete after a
restore.

Filesystem scanning accepts HTML, HTM, PHP, CSS, JavaScript, JSON, XML,
Markdown, and text files up to 2 MB. Symbolic links, hidden paths, binary files,
and the upload directory itself are not scanned. References from external
applications, remote databases, files larger than the scan limit, or unusual
file types cannot be detected. Review integrations and keep backups before a
large cleanup.

## Image derivatives

When `MEDIA_IMAGE_DERIVATIVES_ENABLED=true`, JPEG, PNG, and WebP uploads retain their canonical original and generate:

- a metadata-stripped display image bounded by `MEDIA_IMAGE_MAX_WIDTH` and `MEDIA_IMAGE_MAX_HEIGHT`
- a WebP thumbnail bounded by `MEDIA_THUMBNAIL_WIDTH` and `MEDIA_THUMBNAIL_HEIGHT`
- a responsive WebP representation, unless the display representation is already WebP
- a responsive AVIF representation

Images are auto-oriented before derivative generation. Stored metadata contains only operational fields such as dimensions, format, color space, channel count, alpha presence, orientation, density, and page count; embedded EXIF, IPTC, and XMP payloads are not copied to generated files.

The generated embed snippet uses a `<picture>` element that prefers AVIF, then WebP, then the resized display image. It includes intrinsic dimensions, lazy loading, and asynchronous decoding. GIF and SVG uploads receive safe metadata extraction but do not generate raster derivatives, avoiding accidental animation loss or unexpected SVG rasterization.

Set `MEDIA_IMAGE_DERIVATIVES_ENABLED=false` to stop generating new derivative files while continuing to extract dimensions and metadata. Existing variants remain available and are deleted with their original media record.
