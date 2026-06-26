"use client";

import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { ModalProvider } from "@/components/ModalContext";
import { AccountProvider } from "@/components/AccountContext";
import { useData } from "@/lib/useData";
import AccountModal from "@/components/AccountModal";
import type { AccountInput } from "@/lib/types";
import DashboardModals from "@/components/DashboardModals";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = useData();
  const { accounts, createAccount } = data;

  const [accountModalOpen, setAccountModalOpen] = useState(false);

  return (
    <AccountProvider>
      <ModalProvider
        onOpen={({ trade, date }) => {
          window.dispatchEvent(
            new CustomEvent("dashboard-open-modal", {
              detail: { trade, date },
            }),
          );
        }}
      >
        <AppLayout
          onAddTrade={() =>
            window.dispatchEvent(new CustomEvent("dashboard-open-modal"))
          }
          onAddAccount={() => setAccountModalOpen(true)}
        >
          {children}
        </AppLayout>
      </ModalProvider>

      <DashboardModals />

      <AccountModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        onSubmit={async (input: AccountInput) => {
          await createAccount(input);
          setAccountModalOpen(false);
        }}
      />
    </AccountProvider>
  );
}
