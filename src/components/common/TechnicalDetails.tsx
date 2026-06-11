import type { ReactNode } from "react";

import { DisclosureSection } from "@/components/common/DisclosureSection";

type TechnicalDetailsProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  description?: string;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
  title?: string;
};

export function TechnicalDetails({
  children,
  defaultOpen = false,
  description = "Open for raw metrics, full tables, JSON, command snippets, or debug inputs.",
  onOpenChange,
  testId,
  title = "Advanced details",
}: TechnicalDetailsProps) {
  return (
    <DisclosureSection title={title} description={description} defaultOpen={defaultOpen} onOpenChange={onOpenChange} testId={testId}>
      {children}
    </DisclosureSection>
  );
}
