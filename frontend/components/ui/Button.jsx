import Link from "next/link";

import Icon from "@/components/icons/Icon";

export default function Button({
  children,
  href,
  icon,
  iconPosition = "right",
  variant = "primary",
  fullWidth = false,
  className = "",
  ...props
}) {
  const classes = [
    "button",
    `button-${variant}`,
    fullWidth ? "button-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {icon && iconPosition === "left" ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
      {icon && iconPosition === "right" ? <Icon name={icon} size={18} /> : null}
    </>
  );

  if (href) {
    return <Link href={href} className={classes}>{content}</Link>;
  }

  return (
    <button className={classes} {...props}>
      {content}
    </button>
  );
}
