import { firstString, isHttpUrl, stripHtml, uniqueUrls } from "./utils.mjs";

export const loadDigidealFromSupabase = async (adminClient, productId) => {
  const { data, error } = await adminClient
    .from("digideal_products")
    .select(
      "product_id, listing_title, title_h1, product_url, description_html, primary_image_url, image_urls, description_images"
    )
    .eq("product_id", productId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    return {
      title: "",
      description: "",
      url: "",
      imageUrls: [],
      error: "DigiDeal product not found.",
    };
  }

  const imageUrls = uniqueUrls(
    [
      data.primary_image_url,
      ...(Array.isArray(data.image_urls) ? data.image_urls : []),
      ...(Array.isArray(data.description_images) ? data.description_images : []),
    ].filter((url) => isHttpUrl(url))
  );

  return {
    title: firstString(data.title_h1, data.listing_title),
    description: stripHtml(data.description_html || ""),
    url: firstString(data.product_url),
    imageUrls,
    error: "",
  };
};
