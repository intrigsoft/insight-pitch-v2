import Link from "next/link";

export default function NotFound() {
  return (
    <main className="simple-page">
      <h1>Not found</h1>
      <p>This proposal doesn&apos;t exist, or it&apos;s a draft that only its author can see.</p>
      <Link href="/" className="btn-secondary">Back to proposals</Link>
    </main>
  );
}
