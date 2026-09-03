// src/starme/screens/_DataHarness.tsx
// DEV-ONLY Phase 2 checkpoint. Exercises the data + API layer on device:
// session hydrate + stable device id, SQLite init, wallet debit, the consent FK
// guard, the server-id mapping, and (interactively) the live /v1 backend.
// Not part of the shipping flow.
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StarPalette as C, type as T } from '../theme';
import { StarButton } from '../components';
import { STARME_API_BASE_URL, BUILD_REAL_IDENTITY_ENABLED } from '../config';
import { loadSession, session } from '../data/session';
import { getDb } from '../data/db';
import { walletRepo } from '../data/walletRepo';
import { orderRepo } from '../data/orderRepo';
import { buildServerOrderRequest, SERVER_IDS, api } from '../api/endpoints';
import { ApiError } from '../api/client';
import { welcomeCredits, liveShells } from '../data/manifest';

type Row = { label: string; ok: boolean; detail?: string };

export default function StarMeDataHarness() {
  const [rows, setRows] = useState<Row[]>([]);
  const [net, setNet] = useState<string>('(not run)');

  useEffect(() => {
    (async () => {
      const out: Row[] = [];
      const add = (label: string, ok: boolean, detail?: string) =>
        out.push({ label, ok, detail });

      try {
        await loadSession();
        const id1 = session.deviceBindingId();
        const id2 = session.deviceBindingId();
        add('loadSession + stable device id', !!id1 && id1 === id2, id1);
      } catch (e) {
        add('loadSession', false, String(e));
      }

      try {
        await getDb();
        add('SQLite open + schema', true);
      } catch (e) {
        add('SQLite open + schema', false, String(e));
      }

      try {
        await walletRepo.ensureInitialized();
        const start = await walletRepo.credits();
        await walletRepo.add(200);
        const after = await walletRepo.credits();
        const debitOk = await walletRepo.tryDebit(50);
        const balAfterDebit = await walletRepo.credits();
        const tooMuch = await walletRepo.tryDebit(10_000_000);
        add(
          'wallet add / tryDebit',
          after === start + 200 && debitOk && balAfterDebit === after - 50 && tooMuch === false,
          `start=${start} after+200=${after} debit50=${debitOk} bal=${balAfterDebit} overDebit=${tooMuch}`,
        );
      } catch (e) {
        add('wallet add / tryDebit', false, String(e));
      }

      try {
        let threw = '';
        try {
          await orderRepo.createOrder({
            consentRef: 'STARME-DOES-NOT-EXIST',
            shellId: 'love',
            roleId: 'arjun',
            packageId: 'debut',
            episodesUnlocked: 3,
          });
        } catch (e) {
          threw = (e as Error).message;
        }
        add('consent FK guard blocks order', threw === 'No consent on record for this order.', threw);
      } catch (e) {
        add('consent FK guard', false, String(e));
      }

      const mapped = buildServerOrderRequest({
        consentRef: 'STARME-2026-A1B2C3',
        roleId: null,
        identityAssetId: null,
      });
      add(
        'server-id mapping (7.6)',
        mapped.shell_id === SERVER_IDS.shellId &&
          mapped.package_id === SERVER_IDS.packageId &&
          mapped.role_id === 'arjun' &&
          mapped.face_asset_id === 'synthetic-device-capture',
        `${mapped.shell_id} / ${mapped.package_id} / ${mapped.role_id} / ${mapped.face_asset_id}`,
      );

      add('manifest wired', welcomeCredits === 200 && liveShells().length === 1, `welcome=${welcomeCredits} live=${liveShells().length}`);
      add('config', true, `${STARME_API_BASE_URL} · realIdentity=${BUILD_REAL_IDENTITY_ENABLED}`);

      setRows(out);
    })();
  }, []);

  const runCapabilities = async () => {
    setNet('calling /v1/capabilities ...');
    try {
      const c = await api.capabilities();
      setNet(
        `capabilities OK · consent_version=${c.consent_version ?? 'null'} · identity_capture=${c.identity_capture} · legal=${c.legal_text_status}`,
      );
    } catch (e) {
      setNet(`capabilities FAILED · ${e instanceof ApiError ? e.statusCode : ''} ${String(e)}`);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={{ ...T.headlineMedium, color: C.text, marginBottom: 12 }}>
          Data Harness
        </Text>

        {rows.map((r, i) => (
          <View key={i} style={{ marginBottom: 10 }}>
            <Text style={{ ...T.bodyMedium, color: r.ok ? C.good : C.danger }}>
              {(r.ok ? 'PASS  ' : 'FAIL  ') + r.label}
            </Text>
            {r.detail ? (
              <Text style={{ ...T.bodySmall, color: C.dim }}>{r.detail}</Text>
            ) : null}
          </View>
        ))}

        <Text style={{ ...T.labelSmall, color: C.gold, marginTop: 24, marginBottom: 10 }}>
          LIVE BACKEND
        </Text>
        <Text style={{ ...T.bodySmall, color: C.dim, marginBottom: 10 }}>{net}</Text>
        <View style={{ gap: 10 }}>
          <StarButton label="GET /v1/capabilities" variant="GHOST" onPress={runCapabilities} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
