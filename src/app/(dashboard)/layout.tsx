"use client";

import AppLayout from "@/components/AppLayout";
import { ModalProvider } from "@/components/ModalContext";
import { AccountProvider } from "@/components/AccountContext";
import { ToastProvider } from "@/components/ToastContext";
import { ConfirmProvider } from "@/components/ConfirmContext";
import { ThemeProvider } from "@/components/ThemeContext";
import { useData } from "@/lib/useData";
import AccountModal from "@/components/AccountModal";
import Mt5SyncModal from "@/components/Mt5SyncModal";
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
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AccountProvider>
            <DashboardLayoutInner>{children}</DashboardLayoutInner>
          </AccountProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
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
  const [mt5Account, setMt5Account] = useState<Account | null>(null);

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

  function openMt5Sync(account: Account) {
    closeAccountModal();
    setMt5Account(account);
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
        onSyncAccount={openMt5Sync}
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
        onConnectMt5={editingAccount ? () => openMt5Sync(editingAccount) : undefined}
      />

      <Mt5SyncModal
        open={mt5Account !== null}
        account={mt5Account}
        onClose={() => setMt5Account(null)}
      />
    </ModalProvider>
  );
}
