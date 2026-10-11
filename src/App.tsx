import React, { useState, useEffect, useRef } from "react";
import { HerbItem, ViewTab, DailyReminder, CartItem, StoreConfig } from "./types";
import { Navbar } from "./components/Navbar";
import { CatalogTab } from "./components/CatalogTab";
import { StoreTab } from "./components/StoreTab";
import { StoreAdminTab } from "./components/StoreAdminTab";
import { CartDrawer } from "./components/CartDrawer";
import { AddHerbAiView } from "./components/AddHerbAiView";
import { ComparisonTab } from "./components/ComparisonTab";
import { DrugCheckerTab } from "./components/DrugCheckerTab";
import { RemedyAdvisorTab } from "./components/RemedyAdvisorTab";
import { LocalBackupTab } from "./components/LocalBackupTab";
import { HerbDetailModal } from "./components/HerbDetailModal";
import { DailyReminderModal } from "./components/DailyReminderModal";
import { ActiveReminderAlert } from "./components/ActiveReminderAlert";
import { BrandLogo } from "./components/BrandLogo";
import {
  auth,
  loginWithGoogle,
  logoutUser,
  testFirestoreConnection,
} from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  syncUserProfile,
  syncFavoritesToCloud,
  syncRemindersToCloud,
  saveCustomHerbToCloud,
  subscribeToCloudHerbs,
  subscribeToUserProfile,
} from "./services/firestoreSync";
import {
  loadHerbsFromStorage,
  saveHerbsToStorage,
  loadFavoritesFromStorage,
  saveFavoritesToStorage,
  loadRemindersFromStorage,
  saveRemindersToStorage,
  loadCustomLogo,
  saveCustomLogo,
  resetDatabaseToDefaults,
} from "./utils/storage";
import {
  playHerbalChime,
  showBrowserNotification,
} from "./utils/reminderAudio";
import {
  loadCartFromStorage,
  saveCartToStorage,
  loadStoreConfig,
  saveStoreConfig,
} from "./utils/storeUtils";
import { enrichHerbWithDetailedExplanation } from "./utils/herbEnricher";

export default function App() {
  const [herbs, setHerbs] = useState<HerbItem[]>(() => loadHerbsFromStorage());
  const [favorites, setFavorites] = useState<(string | number)[]>(() =>
    loadFavoritesFromStorage()
  );
  const [reminders, setReminders] = useState<DailyReminder[]>(() =>
    loadRemindersFromStorage()
  );
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(() =>
    loadCustomLogo()
  );
  const [currentTab, setCurrentTab] = useState<ViewTab>("catalog");
  const [selectedHerbForModal, setSelectedHerbForModal] =
    useState<HerbItem | null>(null);

  const [isReminderModalOpen, setIsReminderModalOpen] = useState<boolean>(false);
  const [reminderModalHerbId, setReminderModalHerbId] = useState<string | number | null>(null);
  const [activeTriggeredReminder, setActiveTriggeredReminder] = useState<DailyReminder | null>(null);
  const [reminderFeedbackToast, setReminderFeedbackToast] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>(() => loadCartFromStorage());
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(() => loadStoreConfig());

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const firedMinutesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    testFirestoreConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        syncUserProfile({
          userId: user.uid,
          email: user.email || undefined,
          displayName: user.displayName || undefined,
          photoURL: user.photoURL || undefined,
          favorites,
          reminders,
        }).catch((err) => console.error("Cloud Profile sync error:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribeHerbs = subscribeToCloudHerbs(currentUser.uid, (cloudHerbs) => {
      if (cloudHerbs.length > 0) {
        setHerbs((prev) => {
          const map = new Map<string, HerbItem>();
          prev.forEach((h) => map.set(String(h.id), h));
          cloudHerbs.forEach((ch) => map.set(String(ch.id), ch));
          const merged = Array.from(map.values());
          saveHerbsToStorage(merged);
          return merged;
        });
      }
    });

    const unsubscribeProfile = subscribeToUserProfile(currentUser.uid, (profile) => {
      if (profile && Array.isArray(profile.favorites) && profile.favorites.length > 0) {
        setFavorites((prev) => {
          const combined = Array.from(new Set([...prev.map(String), ...profile.favorites!.map(String)]));
          saveFavoritesToStorage(combined);
          return combined;
        });
      }

      if (profile && Array.isArray(profile.reminders) && profile.reminders.length > 0) {
        setReminders((prev) => {
          const map = new Map<string, DailyReminder>();
          prev.forEach((r) => map.set(r.id, r));
          profile.reminders!.forEach((r) => map.set(r.id, r));
          const merged = Array.from(map.values());
          saveRemindersToStorage(merged);
          return merged;
        });
      }
    });

    return () => {
      unsubscribeHerbs();
      unsubscribeProfile();
    };
  }, [currentUser]);

  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const currentTime = `${hh}:${mm}`;
      const dayOfWeek = now.getDay();
      const dateKey = now.toISOString().slice(0, 10);

      reminders.forEach((r) => {
        if (!r.isActive) return;
        if (r.daysOfWeek && !r.daysOfWeek.includes(dayOfWeek)) return;

        if (r.time === currentTime) {
          const recordKey = `${dateKey}_${currentTime}_${r.id}`;
          if (!firedMinutesRef.current.has(recordKey)) {
            firedMinutesRef.current.add(recordKey);

            setActiveTriggeredReminder(r);

            if (r.soundEnabled !== false) {
              playHerbalChime();
            }

            if (r.browserNotifyEnabled) {
              const bodyText = r.dose
                ? `الجرعة: ${r.dose}${r.timingNote ? ` • ${r.timingNote}` : ""}`
                : r.timingNote || "تذكير يومي بموعد تناول الجرعة";
              showBrowserNotification(
                `حان موعد تناول عشبة ${r.herbNameAr}`,
                bodyText,
                r.id
              );
            }
          }
        }
      });
    };

    const timer = setInterval(checkSchedule, 10000);
    checkSchedule();
    return () => clearInterval(timer);
  }, [reminders]);

  useEffect(() => {
    saveHerbsToStorage(herbs);
  }, [herbs]);

  useEffect(() => {
    saveRemindersToStorage(reminders);
  }, [reminders]);

  useEffect(() => {
    saveFavoritesToStorage(favorites);
  }, [favorites]);

  useEffect(() => {
    saveCartToStorage(cart);
  }, [cart]);

  const handleLogin = async () => {
    try {
      const res = await loginWithGoogle();
      if (res?.cancelled) {
        return;
      }
    } catch (err: any) {
      if (
        err?.code !== "auth/popup-closed-by-user" &&
        err?.code !== "auth/cancelled-popup-request"
      ) {
        console.warn("Login could not be completed:", err?.message || err);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (err: any) {
      console.warn("Logout error:", err?.message || err);
    }
  };

  const handleToggleFavorite = (id: string | number) => {
    setFavorites((prev) => {
      const targetStr = String(id);
      const isFav = prev.some((item) => String(item) === targetStr);
      const next = isFav
        ? prev.filter((item) => String(item) !== targetStr)
        : [...prev, id];
      if (currentUser) {
        syncFavoritesToCloud(currentUser.uid, next).catch((err) =>
          console.error("Failed to sync favorite to cloud:", err)
        );
      }
      return next;
    });
  };

  const handleAddHerb = (newHerb: HerbItem) => {
    const enriched = enrichHerbWithDetailedExplanation(newHerb);
    setHerbs((prev) => [enriched, ...prev]);
    if (currentUser) {
      saveCustomHerbToCloud(currentUser.uid, enriched).catch((err) =>
        console.error("Failed to sync custom herb to cloud:", err)
      );
    }
  };

  const handleUpdateHerb = (updatedHerb: HerbItem) => {
    setHerbs((prev) => {
      const next = prev.map((h) => (String(h.id) === String(updatedHerb.id) ? updatedHerb : h));
      saveHerbsToStorage(next);
      return next;
    });
    setSelectedHerbForModal((prevModalHerb) => {
      if (prevModalHerb && String(prevModalHerb.id) === String(updatedHerb.id)) {
        return updatedHerb;
      }
      return prevModalHerb;
    });
    if (currentUser) {
      saveCustomHerbToCloud(currentUser.uid, updatedHerb).catch((err) =>
        console.error("Failed to sync updated herb to cloud:", err)
      );
    }
  };

  const handleBatchUpdateHerbs = (updatedHerbs: HerbItem[]) => {
    setHerbs(updatedHerbs);
    saveHerbsToStorage(updatedHerbs);
    if (selectedHerbForModal) {
      const found = updatedHerbs.find((h) => String(h.id) === String(selectedHerbForModal.id));
      if (found) {
        setSelectedHerbForModal(found);
      }
    }
  };

  const handleDeleteHerb = (herbId: string | number) => {
    const idStr = String(herbId);
    setHerbs((prev) => {
      const next = prev.filter((h) => String(h.id) !== idStr);
      saveHerbsToStorage(next);
      return next;
    });
    setFavorites((prev) => {
      const next = prev.filter((id) => String(id) !== idStr);
      saveFavoritesToStorage(next);
      return next;
    });
  };

  const handleSyncAllToCloud = async () => {
    if (!currentUser) {
      const res = await loginWithGoogle();
      if (!res || res.cancelled || !res.user) {
        return;
      }
    }
    setIsSyncing(true);
    try {
      await syncUserProfile({
        userId: currentUser!.uid,
        email: currentUser!.email || undefined,
        displayName: currentUser!.displayName || undefined,
        photoURL: currentUser!.photoURL || undefined,
        favorites,
      });

      const customHerbs = herbs.filter((h) => h.isCustom);
      for (const herb of customHerbs) {
        await saveCustomHerbToCloud(currentUser!.uid, herb);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestoreHerbs = (importedHerbs: HerbItem[]) => {
    setHerbs(importedHerbs);
    saveHerbsToStorage(importedHerbs);
  };

  const handleResetDefaults = () => {
    const defaults = resetDatabaseToDefaults();
    setHerbs(defaults);
  };

  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCustomLogoUrl(dataUrl);
      saveCustomLogo(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = () => {
    setCustomLogoUrl(null);
    saveCustomLogo(null);
  };

  const handlePrintPage = () => {
    window.print();
  };

  const handleOpenReminderModal = (herbId?: string | number) => {
    setReminderModalHerbId(herbId || null);
    setIsReminderModalOpen(true);
  };

  const handleSaveReminder = (newReminder: DailyReminder) => {
    setReminders((prev) => {
      const idx = prev.findIndex(
        (r) =>
          r.id === newReminder.id ||
          (String(r.herbId) === String(newReminder.herbId) && r.time === newReminder.time)
      );
      let updated: DailyReminder[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = newReminder;
      } else {
        updated = [newReminder, ...prev];
      }
      saveRemindersToStorage(updated);
      if (currentUser) {
        syncRemindersToCloud(currentUser.uid, updated).catch((err) =>
          console.error("Failed to sync reminder to cloud:", err)
        );
      }
      return updated;
    });

    const remHerbIdStr = String(newReminder.herbId);
    if (!favorites.some((f) => String(f) === remHerbIdStr)) {
      setFavorites((prev) => {
        const next = [...prev, newReminder.herbId];
        saveFavoritesToStorage(next);
        if (currentUser) {
          syncFavoritesToCloud(currentUser.uid, next).catch((e) => console.error(e));
        }
        return next;
      });
    }

    setReminderFeedbackToast(
      `تم تفعيل التنبيه اليومي لعشبة ${newReminder.herbNameAr} بنجاح الساعة ${newReminder.time}`
    );
    setTimeout(() => setReminderFeedbackToast(null), 4500);
  };

  const handleDeleteReminder = (reminderId: string) => {
    setReminders((prev) => {
      const updated = prev.filter((r) => r.id !== reminderId);
      saveRemindersToStorage(updated);
      if (currentUser) {
        syncRemindersToCloud(currentUser.uid, updated).catch((err) =>
          console.error("Failed to delete reminder from cloud:", err)
        );
      }
      return updated;
    });
  };

  const handleToggleReminderActive = (reminderId: string) => {
    setReminders((prev) => {
      const updated = prev.map((r) =>
        r.id === reminderId ? { ...r, isActive: !r.isActive } : r
      );
      saveRemindersToStorage(updated);
      if (currentUser) {
        syncRemindersToCloud(currentUser.uid, updated).catch((err) =>
          console.error("Failed to update reminder active status:", err)
        );
      }
      return updated;
    });
  };

  const handleMarkReminderTaken = (reminderId: string) => {
    const todayIso = new Date().toISOString();
    setReminders((prev) => {
      const updated = prev.map((r) =>
        r.id === reminderId ? { ...r, lastTakenDate: todayIso } : r
      );
      saveRemindersToStorage(updated);
      if (currentUser) {
        syncRemindersToCloud(currentUser.uid, updated).catch((err) =>
          console.error("Failed to update reminder taken status:", err)
        );
      }
      return updated;
    });

    setActiveTriggeredReminder(null);
    setReminderFeedbackToast("بالهناء والشفاء والعافية! تم تسجيل تناول الجرعة بنجاح ✓");
    setTimeout(() => setReminderFeedbackToast(null), 4500);
  };

  const handleSnoozeReminder = (reminderId: string, minutes: number = 10) => {
    setActiveTriggeredReminder(null);
    const target = reminders.find((r) => r.id === reminderId);
    setReminderFeedbackToast(`تم تأجيل التنبيه لمدة ${minutes} دقائق`);
    setTimeout(() => setReminderFeedbackToast(null), 3500);

    setTimeout(() => {
      if (target) {
        setActiveTriggeredReminder(target);
        if (target.soundEnabled !== false) {
          playHerbalChime();
        }
      }
    }, minutes * 60 * 1000);
  };

  const handleTestTriggerReminder = (reminder: DailyReminder) => {
    playHerbalChime();
    setActiveTriggeredReminder(reminder);
  };

  const handleAddToCart = (item: CartItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      let updated: CartItem[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: updated[idx].quantity + item.quantity,
        };
      } else {
        updated = [item, ...prev];
      }
      saveCartToStorage(updated);
      return updated;
    });

    setReminderFeedbackToast(`تمت إضافة "${item.nameAr}" إلى سلة المشتريات 🛒`);
    setTimeout(() => setReminderFeedbackToast(null), 3500);
  };

  const handleUpdateCartQuantity = (id: string, delta: number) => {
    setCart((prev) => {
      const updated = prev
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
      saveCartToStorage(updated);
      return updated;
    });
  };

  const handleRemoveCartItem = (id: string) => {
    setCart((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveCartToStorage(updated);
      return updated;
    });
  };

  const handleClearCart = () => {
    setCart([]);
    saveCartToStorage([]);
  };

  const handleUpdateStoreConfig = (newConfig: StoreConfig) => {
    setStoreConfig(newConfig);
    saveStoreConfig(newConfig);
  };

  const activeRemindersCount = reminders.filter((r) => r.isActive).length;
  const remindersHerbIds = reminders.map((r) => r.herbId);
  const totalCartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#FBF7EE] text-[#1D2520] font-['Cairo'] flex flex-col selection:bg-[#C59B27] selection:text-[#132B20] relative"
    >
      {reminderFeedbackToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-[#132B20] text-[#FBF7EE] border-2 border-[#C59B27] px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-3 duration-300">
          <span className="w-2 h-2 rounded-full bg-[#F5DC7D] animate-ping" />
          <span>{reminderFeedbackToast}</span>
        </div>
      )}

      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        totalHerbsCount={herbs.length}
        customLogoUrl={customLogoUrl}
        onUploadLogo={handleUploadLogo}
        onResetLogo={handleResetLogo}
        onPrintPage={handlePrintPage}
        currentUser={currentUser}
        onLogin={handleLogin}
        onLogout={handleLogout}
        isSyncing={isSyncing}
        onOpenReminders={() => handleOpenReminderModal()}
        activeRemindersCount={activeRemindersCount}
        onOpenCart={() => setIsCartOpen(true)}
        cartCount={totalCartCount}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-8">
        {currentTab === "catalog" && (
          <CatalogTab
            herbs={herbs}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onOpenDetails={(herb) => setSelectedHerbForModal(herb)}
            onNavigateAddAi={() => setCurrentTab("add-ai")}
            onAddToCompare={(_herb) => {
              setCurrentTab("comparison");
            }}
            customLogoUrl={customLogoUrl}
            onOpenReminder={handleOpenReminderModal}
            remindersHerbIds={remindersHerbIds}
            activeRemindersCount={activeRemindersCount}
            onAddToCart={handleAddToCart}
            storeConfig={storeConfig}
            onOpenCart={() => setIsCartOpen(true)}
            cartCount={totalCartCount}
          />
        )}

        {currentTab === "store" && (
          <StoreTab
            herbs={herbs}
            cart={cart}
            onAddToCart={handleAddToCart}
            onOpenHerbDetails={(herb) => setSelectedHerbForModal(herb)}
            onOpenCart={() => setIsCartOpen(true)}
            storeConfig={storeConfig}
          />
        )}

        {currentTab === "store-admin" && (
          <StoreAdminTab
            herbs={herbs}
            storeConfig={storeConfig}
            onUpdateStoreConfig={handleUpdateStoreConfig}
            onUpdateHerb={handleUpdateHerb}
            onBatchUpdateHerbs={handleBatchUpdateHerbs}
            onDeleteHerb={handleDeleteHerb}
            onAddHerb={handleAddHerb}
            onOpenHerbDetails={(herb) => setSelectedHerbForModal(herb)}
            onNavigateToBackup={() => setCurrentTab("backup")}
          />
        )}

        {currentTab === "add-ai" && (
          <AddHerbAiView
            onAddHerb={handleAddHerb}
            existingCount={herbs.length}
            existingHerbs={herbs}
          />
        )}

        {currentTab === "comparison" && (
          <ComparisonTab herbs={herbs} customLogoUrl={customLogoUrl} />
        )}

        {currentTab === "checker" && (
          <DrugCheckerTab herbs={herbs} customLogoUrl={customLogoUrl} />
        )}

        {currentTab === "advisor" && (
          <RemedyAdvisorTab customLogoUrl={customLogoUrl} />
        )}

        {currentTab === "backup" && (
          <LocalBackupTab
            herbs={herbs}
            favoritesCount={favorites.length}
            onRestoreHerbs={handleRestoreHerbs}
            onResetDefaults={handleResetDefaults}
            currentUser={currentUser}
            onLogin={handleLogin}
            onLogout={handleLogout}
            onSyncToCloud={handleSyncAllToCloud}
            isSyncing={isSyncing}
            onNavigateToStoreAdmin={() => setCurrentTab("store-admin")}
            storeConfig={storeConfig}
          />
        )}
      </main>

      {selectedHerbForModal && (
        <HerbDetailModal
          herb={selectedHerbForModal}
          onClose={() => setSelectedHerbForModal(null)}
          customLogoUrl={customLogoUrl}
          onSetReminder={(herb) => handleOpenReminderModal(herb.id)}
          onAddToCart={handleAddToCart}
          storeConfig={storeConfig}
        />
      )}

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        storeConfig={storeConfig}
        onUpdateStoreConfig={handleUpdateStoreConfig}
        onNavigateToCatalog={() => {
          setIsCartOpen(false);
          setCurrentTab("catalog");
        }}
      />

      <DailyReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => {
          setIsReminderModalOpen(false);
          setReminderModalHerbId(null);
        }}
        herbs={herbs}
        favorites={favorites}
        reminders={reminders}
        onSaveReminder={handleSaveReminder}
        onDeleteReminder={handleDeleteReminder}
        onToggleReminderActive={handleToggleReminderActive}
        onTestTriggerReminder={handleTestTriggerReminder}
        initialHerbId={reminderModalHerbId}
        onOpenHerbDetails={(herb) => {
          setIsReminderModalOpen(false);
          setSelectedHerbForModal(herb);
        }}
        onNavigateToCatalog={() => {
          setIsReminderModalOpen(false);
          setCurrentTab("catalog");
        }}
      />

      {activeTriggeredReminder && (
        <ActiveReminderAlert
          reminder={activeTriggeredReminder}
          onDismiss={() => setActiveTriggeredReminder(null)}
          onMarkTaken={handleMarkReminderTaken}
          onSnooze={handleSnoozeReminder}
          onOpenHerbDetails={(herbId) => {
            const target = herbs.find((h) => String(h.id) === String(herbId));
            if (target) {
              setActiveTriggeredReminder(null);
              setSelectedHerbForModal(target);
            }
          }}
        />
      )}

      <footer className="bg-[#132B20] text-[#FBF7EE] border-t-2 border-[#C59B27] py-8 px-4 mt-12 no-print">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-center md:text-right">
            <div className="bg-[#0C1B14] p-2 rounded-2xl border border-[#C59B27]/40 shadow-inner">
              <BrandLogo size="sm" showSubtitle={false} customLogoUrl={customLogoUrl} />
            </div>
            <div>
              <div className="flex items-center justify-center md:justify-start gap-2">
                <span className="text-lg font-black font-['Cairo'] text-[#FBF7EE]">
                  1000 عشبة
                </span>
                <span className="text-xs font-bold text-[#F5DC7D] font-['Amiri']">
                  جُمعت لأجلك
                </span>
              </div>
              <p className="text-xs text-[#E2D6B5]/75 font-medium mt-0.5">
                الصيدلية النباتية الذكية الموثقة • مزامنة سحابية هجينة مع Firebase Firestore
              </p>
            </div>
          </div>

          <div className="text-center md:text-left text-xs text-[#E2D6B5]/80 space-y-1">
            <p className="font-['Amiri'] text-sm text-[#F5DC7D]">
              «من نباتات الأرض يستخرج الحكيم شفاؤه»
            </p>
            <p className="text-[11px] text-[#A69772]">
              جميع الحقوق محفوظة © {new Date().getFullYear()} • تطبيق 1000 عشبة
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
