import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { db } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

const types = [
  "retail",
  "restaurant",
  "wholesale",
  "pharmacy",
  "manufacturing",
  "distribution",
  "services",
  "other",
];

const currencies = ["USD", "EUR", "GBP", "PHP", "AUD", "CAD", "SGD", "INR", "NGN", "ZAR"];

function Onboarding() {
  const navigate = useNavigate();
  const { refresh, switchBusiness } = useBusiness();
  const [name, setName] = useState("");
  const [type, setType] = useState("retail");
  const [currency, setCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState("0");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Business name is required");
    setLoading(true);
    const { data, error } = await db
      .from("businesses")
      .insert({ name: name.trim(), type, currency, tax_rate: Number(taxRate) || 0 })
      .select()
      .single();
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }

    // Persist referral attribution against the business itself (never cookie-only).
    const code = readReferralCode();
    if (code) {
      try {
        await attachReferral({ data: { businessId: data.id, code } });
      } catch {
        /* attribution is best-effort and must never block onboarding */
      }
      clearReferralCode();
    }

    setLoading(false);
    switchBusiness(data.id);
    refresh();
    toast.success("Business created");
    navigate({ to: "/setup", replace: true });

  }


  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <form onSubmit={submit} className="w-full max-w-md space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">Create your business</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each business is a fully isolated workspace. You can create more later.
          </p>
        </div>

        <div>
          <Label htmlFor="name">Business name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Northside Trading Co."
            className="mt-1.5"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Business type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="tax">Default tax rate (%)</Label>
          <Input
            id="tax"
            type="number"
            step="any"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            className="mt-1.5"
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating..." : "Create business"}
        </Button>
      </form>
    </div>
  );
}
