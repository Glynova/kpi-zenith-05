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
