"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { lookupSuffix, readOrderLookupToken } from "@/lib/orderLookupToken";

export default function PaymentOrderLink({
  href,
  orderNumber,
  lookupToken = "",
  emailOrPhone = "",
  className = "",
  children,
}) {
  const [storedLookupToken, setStoredLookupToken] = useState("");

  useEffect(() => {
    if (!lookupToken && orderNumber) {
      setStoredLookupToken(readOrderLookupToken(orderNumber));
    }
  }, [lookupToken, orderNumber]);

  const suffix = useMemo(
    () => lookupSuffix({ lookupToken: lookupToken || storedLookupToken, emailOrPhone }),
    [emailOrPhone, lookupToken, storedLookupToken],
  );

  return (
    <Link href={`${href}${suffix}`} className={className}>
      {children}
    </Link>
  );
}
