import { IResourceComponentsProps } from "@refinedev/core";
import { Show } from "@refinedev/mui";
import React from "react";
import { LoanDetailView } from "../../components/loans";

/**
 * Enhanced loan show component for displaying detailed loan information
 */
export const LoanShow: React.FC<IResourceComponentsProps> = () => {
  return (
    <Show
      title="Loan Details"
      canEdit
      headerButtons={({ defaultButtons }) => defaultButtons}
    >
      <LoanDetailView />
    </Show>
  );
};

export default LoanShow;