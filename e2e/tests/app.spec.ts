import { expect, test, type Page } from '@playwright/test';

// Üretimdeki güvenlik başlıkları (CSP) uygulamanın bir parçasını engellerse test düşer
const cspErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  cspErrors.set(page, errors);
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) errors.push(m.text());
  });
});
test.afterEach(({ page }) => {
  expect(cspErrors.get(page)).toEqual([]);
});

async function typeOnKeypad(page: Page, digits: string) {
  // Web'de tuş takımı klavyeyi de dinler; odak bir giriş alanında olmamalı
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.type(digits);
}

test('misafir: örnek verilerle açılır ve ana ekran dolu gelir', async ({ page }) => {
  await page.goto('/login');
  await page.getByText('Kayıt olmadan örnek verilerle dene').click();
  await expect(page.getByText('Bu ay harcadın', { exact: true })).toBeVisible();
  await expect(page.getByText('Misafir modundasın')).toBeVisible();
  // Yeni ana sayfa: banka hesabı yokken hesap ekleme daveti ve alt menüde Ödemeler/Hesaplar sekmeleri
  await expect(page.getByText('Banka hesabını ekle')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Harcamalar' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Ödemeler' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Hesaplar' })).toBeVisible();
});

test('hesap ve yapıştırılan taksitler Hesaplar ile Ödemeler sekmelerinde görünür', async ({ page }) => {
  await page.goto('/login');
  await page.getByText('Kayıt olmadan örnek verilerle dene').click();
  await expect(page.getByText('Misafir modundasın')).toBeVisible();

  // Eksi bakiyeli banka hesabı
  await page.getByRole('tab', { name: 'Hesaplar' }).click();
  await expect(page.getByText('Bankadaki paran ve borçların')).toBeVisible();
  await page.goto('/account?id=new');
  await page.getByLabel('Adı').fill('Vadesiz');
  await page.getByLabel('Bakiye').fill('-5000');
  await page.getByText('Kaydet', { exact: true }).click();

  // Taksit listesini yapıştır
  await page.goto('/schedule-import');
  await page.getByLabel('Ödeme listesi').fill('Kart taksitleri :\n11/12/2030\nzara 1495 tl');
  await page.getByText(/1 ödemeyi ekle/).click();

  await page.goto('/payments');
  await expect(page.getByText('Şu an hesabında (banka + nakit)')).toBeVisible();
  await expect(page.getByText('-₺5.000').first()).toBeVisible();
  await page.goto('/accounts');
  await expect(page.getByText('Kart taksitleri').first()).toBeVisible();
});

test('kayıt, kurulum ve harcama; harcama analizi', async ({ page }) => {
  const email = `e2e-${Date.now()}@test.dev`;
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Kayıt ol' }).click();
  await page.getByLabel('Adın').fill('Deneme');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre').fill('e2e-sifre-123');
  await page.getByRole('button', { name: 'Hesap oluştur' }).click();

  // Kurulum 1: gelir
  await expect(page.getByText('kazanıyorsun?')).toBeVisible();
  await page.getByText('₺0').first().click();
  await typeOnKeypad(page, '30000');
  await page.getByRole('button', { name: 'Tamam' }).click();
  await page.getByRole('button', { name: 'Devam' }).click();

  // Kurulum 2: kategoriler (varsayılanlar seçili); bütçe dağıtımı yok, doğrudan ana sayfa
  await page.getByRole('button', { name: 'Kategorileri oluştur' }).click();
  await expect(page.getByText('Bu ay harcadın', { exact: true })).toBeVisible();

  // Harcama: tuş takımı + not + etiket
  await page.goto('/add');
  await expect(page.getByText('Kategori', { exact: true })).toBeVisible();
  await typeOnKeypad(page, '250');
  await page.getByLabel('Not').fill('Kahve #e2e');
  await page.getByRole('button', { name: '₺250 ekle' }).click();
  await expect(page.getByText('Bu ay harcadın', { exact: true })).toBeVisible();
  await expect(page.getByText('250').first()).toBeVisible();

  // Harcamalar: kategori dağılımı ve en çok harcanan yer
  await page.goto('/envelopes');
  await expect(page.getByText('Nereye gitti')).toBeVisible();
  await expect(page.getByText('Kahve #e2e').or(page.getByText('Kahve')).first()).toBeVisible();

  await page.goto('/tags');
  await expect(page.getByText('#e2e')).toBeVisible();
});

test('çevrimdışı eklenen harcama bağlantı gelince gönderilir', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByText('Kayıt olmadan örnek verilerle dene').click();
  await expect(page.getByText('Bu ay harcadın', { exact: true })).toBeVisible();
  await page.goto('/add');
  await expect(page.getByText('Kategori', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await typeOnKeypad(page, '42');
  await page.getByRole('button', { name: '₺42 ekle' }).click();
  await expect(page.getByText(/Çevrimdışısın/)).toBeVisible();
  await expect(page.getByText(/harcama gönderilmeyi bekliyor/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/Çevrimdışı eklenen 1 harcama gönderildi/)).toBeVisible({ timeout: 30_000 });
});

test('meydan okumalar, rozetler, abonelikler ve yedek ekranları açılır', async ({ page }) => {
  await page.goto('/login');
  await page.getByText('Kayıt olmadan örnek verilerle dene').click();
  await expect(page.getByText('Bu ay harcadın', { exact: true })).toBeVisible();
  await page.goto('/challenges');
  await expect(page.getByText('Her gün kayıt').first()).toBeVisible();
  await expect(page.getByText(/Rozetler · \d+\/10/)).toBeVisible();
  await page.goto('/subscriptions');
  await expect(page.getByText('Yılda toplam')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: /Yedeği indir/ })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByText('Yedeği indir').click();
  expect((await download).suggestedFilename()).toMatch(/^kumbara-yedek-.*\.json$/);
});
