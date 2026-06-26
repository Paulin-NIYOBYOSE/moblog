"use client";

import AppLayout from "@/components/AppLayout";
import { ModalProvider } from "@/components/ModalContext";
import { AccountProvider } from "@/components/AccountContext";
import { ToastProvider } from "@/components/ToastContext";
import { ConfirmProvider } from "@/components/ConfirmContext";
import { useData } from "@/lib/useData";
import AccountModal from "@/components/AccountModal";
import type { Account, AccountInput } from "@/lib/types";
import DashboardModals from "@/components/DashboardModals";
import { useState } from "react";
import { useConfirm } from "@/components/ConfirmContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AccountProvider>
          <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </AccountProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

function DashboardLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = useData();
  const { accounts, createAccount, updateAccount, deleteAccount } = data;
  const confirm = useConfirm();

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);

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
    const confirmed = await confirm({
      title: "Delete account",
      message: `Delete "${account.name}" and all its trades? This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingAccountId(account.id);
    try {
      await deleteAccount(account.id);
    } finally {
      setDeletingAccountId(null);
    }
  }

  return (
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
        deletingAccountId={deletingAccountId}
      >
        {children}
      </AppLayout>

      <DashboardModals />

      <AccountModal
        open={accountModalOpen}
        account={editingAccount}
        onClose={closeAccountModal}
        onSubmit={handleAccountSubmit}
        onDelete={deleteAccount}
      />
    </ModalProvider>
  );
}
