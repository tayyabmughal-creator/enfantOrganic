export default function Badge({ children, tone = "new" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
