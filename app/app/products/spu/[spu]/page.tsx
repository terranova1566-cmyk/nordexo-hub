import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

type Props = {
  params: { spu: string };
};

export default async function ProductSpuRedirectPage({ params }: Props) {
  const raw = typeof params?.spu === "string" ? params.spu : "";
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  const spu = decoded.trim().toUpperCase();
  const fallback = `/app/products?q=${encodeURIComponent(spu)}`;

  if (!spu) {
    redirect("/app/products");
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?redirectedFrom=${encodeURIComponent(`/app/products/spu/${spu}`)}`
    );
  }

  const { data, error } = await supabase
    .from("catalog_products")
    .select("id")
    .eq("spu", spu)
    .maybeSingle();

  if (error || !data?.id) {
    redirect(fallback);
  }

  redirect(`/app/products/${data.id}`);
}

