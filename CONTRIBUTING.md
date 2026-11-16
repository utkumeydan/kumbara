<p align="right"><a href="#contributing">English</a> · <b>Türkçe</b></p>

# Katkı

Katkın için teşekkürler! Hata bildirimi, öneri ve pull request'ler memnuniyetle karşılanır. Türkçe ya da İngilizce yazabilirsin.

## Başlamadan önce

- Büyük bir değişiklik düşünüyorsan önce bir issue açıp konuşalım.
- Güvenlik açıkları için issue açma; [SECURITY.md](SECURITY.md) adımlarını izle.

## Geliştirme

Kurulum için [README](README.tr.md#yerelde-çalıştırma). Pull request göndermeden önce:

```bash
cd apps/api && npm run typecheck && npm test
cd apps/mobile && npx tsc --noEmit && npx expo lint
cd e2e && npx playwright test
```

- Arayüz metinleri Türkçedir; yeni metinleri de Türkçe yaz.
- Para tutarları her yerde kuruş cinsinden tamsayıdır.
- Veritabanı şeması değiştiyse `npm run db:generate` ile migration üret ve onu da ekle.
- Yeni bir API ucu ekliyorsan kaydın isteği yapan kişiye ait olduğunu kontrol et ve bir test yaz.
- Gerçek kişisel ya da finansal veri (isim, IBAN, kart numarası, banka dökümü) depoya, testlere ya da issue'lara koyma.

---

## Contributing

Thanks for contributing! Bug reports, ideas and pull requests are welcome, in English or Turkish.

- For larger changes, please open an issue first so we can discuss it.
- Do not open public issues for security problems; follow [SECURITY.md](SECURITY.md).

See the [README](README.md#running-locally) for setup. Before sending a pull request:

```bash
cd apps/api && npm run typecheck && npm test
cd apps/mobile && npx tsc --noEmit && npx expo lint
cd e2e && npx playwright test
```

- The app's interface text is in Turkish; write new strings in Turkish (translations are welcome as separate work).
- Money amounts are integer kuruş (1/100 of a lira) everywhere.
- If you change the database schema, generate a migration with `npm run db:generate` and include it.
- If you add an API endpoint, check that the record belongs to the caller and add a test.
- Never put real personal or financial data (names, IBANs, card numbers, bank statements) in the repository, tests or issues.
