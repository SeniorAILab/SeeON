import Link from "next/link";

// ponytail: the admin breadcrumb + nav header was copy-pasted 6× across the
// 3 list pages (Production + Demo each). Same markup, links vary per page.
export function AdminHeader({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-brand">Admin</p>
        <h1 className="mt-1 text-2xl font-bold text-ink text-balance">{title}</h1>
      </div>
      <div className="flex gap-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm text-ink-2 hover:text-ink">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
