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
- Product prices and HPP are per pack; inventory and transaction quantities are integer pcs, with `pcs_per_pack` snapshotted in transaction JSON. Why: partial-pack sales remain exact even if pack sizes change later.
- Owner/Sales membership lives in `team_members`; business rows belong to the Owner, sales read a cost-free catalog, and only verified Owner server functions read HPP. Why: operational collaboration must not expose profit data.
- Transaction discounts are stored as `discount_amount` per receipt, capped at that visit's sales and applied before previous debt. Why: old debts remain unchanged while the discounted sale and reports reconcile.
- Direct Sale transactions use only `line_items`, never load or write outlet consignment stock, and deduct sold pcs directly from shared warehouse stock. Why: direct sales must remain separate from store deposits.
- Transaction revisions run through one database function that reverses old stock, applies revised stock, and cascades consignment debt forward; outlet, date, and transaction type remain immutable. Why: revisions must not leave stock or debt partially updated.
- The transactions section uses an Outlet-only parent route and a separate index leaf for its list. Why: nested transaction edit pages must render through the parent route.
- Outlet profile edits remain owner-only while sales retain read and visit access. Why: storefront identity and route details are business-managed data.
- Each consignment snapshots the Owner's stock scheme; `remaining` means shelf stock and `returned` means physical stock returned to the warehouse. Why: stock history and revisions must remain stable when settings change.
- Keep index-signature dot-access checking disabled in TypeScript because the generated cloud client uses dot access for injected environment variables and must not be edited. Why: generated files remain regenerable without failing project checks.
- Consignment sales leave the outlet as ledger sale movements, while new deposits transfer Sales stock to the outlet and physical returns transfer outlet stock to Sales. Why: each location's physical balance must reconcile after visits.
