import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ActionRequiredCardProps = {
  actionLabel?: string;
  children?: ReactNode;
  href?: string;
  title: string;
};

export function ActionRequiredCard({
  actionLabel = "Review",
  children,
  href,
  title,
}: ActionRequiredCardProps) {
  const content = (
    <Button variant="secondary" className="w-full md:w-auto">
      {actionLabel}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Button>
  );

  return (
    <Card className="border-amber-300/25 bg-amber-300/10">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base text-amber-100">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {title}
        </CardTitle>
        <Badge variant="warning">action required</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
        <div className="max-w-3xl">{children}</div>
        {href ? <Link to={href}>{content}</Link> : content}
      </CardContent>
    </Card>
  );
}
