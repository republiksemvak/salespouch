<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Signed-in pages live under `src/routes/_authenticated/`; its layout also gates trial/license and business-name setup. Why: one place for access control.
- Store photos go in a private bucket, shown via signed URLs. Why: workspace blocks public buckets.
- License is `profiles.license_until`; users can only update `business_name` (column grant). Why: prevent self-extending licenses.
