"use client";

import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { ModalProvider } from "@/components/ModalContext";
import { AccountProvider } from "@/components/AccountContext";
import { useData } from "@/lib/useData";
import AccountModal from "@/components/AccountModal";
import type { Account, AccountInput } from "@/lib/types";
import DashboardModals from "@/components/DashboardModals";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = useData();
  const { accounts, createAccount, updateAccount, deleteAccount } = data;

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  function openAddAccount() {
    setEditingAccount(null);
    setAccountModalOpen(true);
  }

  function openEditAccount(account: Account) {
    setEditingAccount(account);
    setAccountModalOpen(true);
  }

  function closeAccountModal() {
    setAccountModalOpen(false);
    setEditingAccount(null);
  }

  async function handleAccountSubmit(input: AccountInput) {
    if (editingAccount) {
      await updateAccount(editingAccount.id, input);
    } else {
      await createAccount(input);
    }
  }

  async function handleDeleteAccount(account: Account) {
    if (
      !window.confirm(
        `Delete "${account.name}" and all its trades? This cannot be undone.`,
      )
    ) {
      return;
    }
    await deleteAccount(account.id);
  }

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
          onAddAccount={openAddAccount}
          onEditAccount={openEditAccount}
          onDeleteAccount={handleDeleteAccount}
        >
          {children}
        </AppLayout>
      </ModalProvider>

      <DashboardModals />

      <AccountModal
        open={accountModalOpen}
        account={editingAccount}
        onClose={closeAccountModal}
        onSubmit={handleAccountSubmit}
        onDelete={deleteAccount}
      />
    </AccountProvider>
  );
}
