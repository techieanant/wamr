import React from 'react';

// Utility type wrapping Radix primitive props and adding common HTML props
export type PrimitiveProps<T extends React.ElementType> = React.ComponentPropsWithoutRef<T> &
  React.HTMLAttributes<HTMLElement> & {
    className?: string;
    children?: React.ReactNode;
  };
