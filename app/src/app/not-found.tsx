import Link from "next/link";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="simple-page">
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.text")}</p>
      <Link href="/" className="btn-secondary">{t("set.backToProposals")}</Link>
    </main>
  );
}
