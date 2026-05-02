"use client";

import Icon from "@/components/icons/Icon";

export default function QuantityStepper({ value, onDecrease, onIncrease }) {
  return (
    <div className="quantity-stepper">
      <button aria-label="Decrease quantity" type="button" onClick={onDecrease}>
        <Icon name="minus" size={18} />
      </button>
      <span className="quantity-value">{value}</span>
      <button aria-label="Increase quantity" type="button" onClick={onIncrease}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}
