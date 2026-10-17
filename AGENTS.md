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
- "Made from" components for every item type live in bundle_components (quantity stored in the component's stock unit, variant required when the component has variants); consumption_mode on products decides sale-time deduction (on_sale) vs batch production via produce_made_from (on_production). Why: one engine instead of separate recipe/bundle paths; legacy bill_of_materials stays for existing recipes.
- Add-on groups are shared per business (addon_groups → addon_options → addon_option_components, linked via product_addon_groups); selected options are snapshotted in sale_item_addons and their ingredients deducted by the post_sale_addons trigger when a sale posts. Why: one reusable group serves many items and history keeps the price/cost at sale time.
- Costing method (business or item) can only change while the affected items hold no stock or open cost layers; enforced by DB trigger guard_costing_method_change. Why: past FIFO layers and running averages must never be reinterpreted under another method.
- Item-level costing_method overrides business_settings.costing_method everywhere costs are taken (apply_cost_layers, complete_sale). Why: the item form sets it intentionally.
- Workspace headers use PageHeader with stacked text/actions below desktop; filters use page-toolbar and actions use page-actions. Why: shared layouts prevent action groups from squeezing titles or overflowing small screens.
- Public, workspace, admin and affiliate headers use BrandIdentity and the shared official SVG path artwork, including its wordmark; inverse marks always-dark surfaces. Why: portal branding must preserve the supplied artwork without font substitutions while navigation remains independent.
- Invitation links use the shared invite-links resolver and server-observed request origin, never a client-provided origin; acceptance selects the RPC-returned business and OAuth carries a validated token through the public callback. Why: invitations must remain first-party and join the intended existing workspace.
