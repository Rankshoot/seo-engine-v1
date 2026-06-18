import type {
  LandingPageContentData,
  LandingPageSection,
  LandingPageHeroSection,
  LandingPageFeaturesSection,
  LandingPageStatsSection,
  LandingPageHowItWorksSection,
  LandingPageTestimonialsSection,
  LandingPageFaqSection,
  LandingPageCtaSection,
  LandingPageBenefitsSection,
  Project,
} from '@/lib/types';

function escapeHTML(str: string): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getGoogleFontsLink(fontFamilyStr?: string | null): string {
  if (!fontFamilyStr) {
    return '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">';
  }
  const fontName = fontFamilyStr.split(',')[0].replace(/['"]/g, '').trim();
  if (fontName.toLowerCase() === 'sans-serif' || fontName.toLowerCase() === 'serif') {
    return '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">';
  }
  const formattedName = fontName.replace(/\s+/g, '+');
  return `<link href="https://fonts.googleapis.com/css2?family=${formattedName}:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">`;
}

function getFontFamilyName(fontFamilyStr?: string | null): string {
  if (!fontFamilyStr) return 'Inter';
  return fontFamilyStr.split(',')[0].replace(/['"]/g, '').trim();
}

function getButtonRadiusClass(style?: string | null): string {
  if (style === 'rounded-none') return 'rounded-none';
  if (style === 'rounded-md') return 'rounded-md';
  return 'rounded-full';
}

function renderCtaButtonHtml({
  text,
  className,
  ctaLink,
  buttonStyle,
}: {
  text: string;
  className: string;
  ctaLink?: string | null;
  buttonStyle?: string | null;
}): string {
  const radiusClass = getButtonRadiusClass(buttonStyle);
  const cleanedClass = className.replace(/\brounded-(?:full|md|none)\b/g, "").trim() + " " + radiusClass;

  if (ctaLink) {
    return `<a href="${escapeHTML(ctaLink)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center text-center transition-all ${cleanedClass}">${escapeHTML(text)}</a>`;
  }
  return `<button class="transition-all ${cleanedClass}">${escapeHTML(text)}</button>`;
}

function renderCtaButtonReact({
  text,
  className,
  ctaLink,
  buttonStyle,
}: {
  text: string;
  className: string;
  ctaLink?: string | null;
  buttonStyle?: string | null;
}): string {
  const radiusClass = getButtonRadiusClass(buttonStyle);
  const cleanedClass = className.replace(/\brounded-(?:full|md|none)\b/g, "").trim() + " " + radiusClass;

  if (ctaLink) {
    return `<a href="${ctaLink}" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center text-center transition-all ${cleanedClass}">${text}</a>`;
  }
  return `<button className="transition-all ${cleanedClass}">${text}</button>`;
}

export function exportLandingPageToHtml(
  data: LandingPageContentData,
  project: Project | null
): string {
  const primaryColor = project?.brand_primary_color || '#7c3aed';
  const secondaryColor = project?.brand_secondary_color || '#e0d9ff';
  const accentColor = project?.brand_accent_color || '#4f46e5';
  const fontStack = project?.brand_font_family || 'Inter, sans-serif';
  const isDark = project?.brand_theme === 'dark';
  const ctaLink = project?.brand_cta_link || null;
  const buttonStyle = project?.brand_button_style || 'rounded-full';
  const companyName = data.company_name || project?.name || 'Studio';

  const sectionsHtml = data.sections.map((s) => {
    switch (s.type) {
      case 'hero': {
        const hs = s as LandingPageHeroSection;
        const badgeHtml = hs.badge
          ? `<span class="inline-block px-4 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur mb-4 border ${
              isDark
                ? 'border-white/30 bg-white/15 text-white'
                : 'border-[var(--lp-primary)]/20 bg-[var(--lp-primary)]/5 text-[var(--lp-primary)]'
            }">${escapeHTML(hs.badge)}</span>`
          : '';
        const trustSignalsHtml = hs.trust_signals?.length
          ? `
            <div class="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-4 text-xs ${
              isDark ? 'text-white/60' : 'text-slate-400'
            }">
              ${hs.trust_signals.map(t => `<span class="flex items-center gap-1.5"><span class="${isDark ? 'text-white' : 'text-[var(--lp-primary)]'}">✓</span> ${escapeHTML(t)}</span>`).join('')}
            </div>
          `
          : '';
        
        const primaryCtaBtn = renderCtaButtonHtml({
          text: hs.cta_primary,
          className: isDark
            ? 'bg-white text-[var(--lp-primary)] hover:shadow-lg px-7 py-3 text-sm font-bold'
            : 'bg-[var(--lp-primary)] text-white hover:shadow-lg px-7 py-3 text-sm font-bold',
          ctaLink,
          buttonStyle,
        });

        const secondaryCtaBtn = hs.cta_secondary
          ? renderCtaButtonHtml({
              text: hs.cta_secondary,
              className: isDark
                ? 'border border-white/50 hover:bg-white/10 px-7 py-3 text-sm font-semibold text-white'
                : 'border border-[var(--lp-primary)]/30 hover:bg-[var(--lp-primary)]/5 px-7 py-3 text-sm font-semibold text-[var(--lp-primary)]',
              ctaLink,
              buttonStyle,
            })
          : '';

        const visualContent = hs.image_url
          ? `<img src="${escapeHTML(hs.image_url)}" alt="${escapeHTML(hs.headline)}" class="w-full max-w-md aspect-[4/3] object-cover rounded-2xl shadow-2xl border ${isDark ? 'border-white/20' : 'border-slate-200/80'}" />`
          : `
            <!-- Branded Visual Mockup -->
            <div class="relative w-full max-w-md aspect-square rounded-2xl p-6 shadow-2xl flex flex-col justify-between overflow-hidden border ${
              isDark
                ? 'bg-white/10 border-white/20 text-white backdrop-blur-md'
                : 'bg-white border-slate-200/80 text-slate-800'
            }">
              <div class="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full blur-3xl ${isDark ? 'bg-[var(--lp-secondary)]/25' : 'bg-[var(--lp-secondary)]/10'}"></div>
              <div class="flex items-center justify-between border-b pb-4 ${isDark ? 'border-white/15' : 'border-slate-100'}">
                <div class="flex gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-full ${isDark ? 'bg-white/40' : 'bg-slate-350'}"></span>
                  <span class="w-2.5 h-2.5 rounded-full ${isDark ? 'bg-white/40' : 'bg-slate-350'}"></span>
                  <span class="w-2.5 h-2.5 rounded-full ${isDark ? 'bg-white/40' : 'bg-slate-350'}"></span>
                </div>
                <span class="text-[10px] font-mono tracking-wider ${isDark ? 'text-white/50' : 'text-slate-400'}">SEO SUPPORTING DRAFT</span>
              </div>
              <div class="my-auto space-y-4 text-center">
                <div class="inline-flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-inner border ${isDark ? 'bg-white/10 border-white/20' : 'bg-slate-55 border-slate-100'}">🎯</div>
                <h3 class="text-lg font-bold">${escapeHTML(data.primary_keyword)}</h3>
                <p class="text-xs leading-relaxed max-w-xs mx-auto ${isDark ? 'text-white/70' : 'text-slate-500'}">This page targets organic search traffic and is custom-built matching <b>${escapeHTML(companyName)}</b> design theme.</p>
              </div>
              <div class="border-t pt-4 flex items-center justify-between text-[11px] ${isDark ? 'border-white/10 text-white/60' : 'border-slate-100 text-slate-400'}">
                <span>${escapeHTML(companyName)} Brand Engine</span>
                <span>100% SEO Ready</span>
              </div>
            </div>
          `;

        return `
          <!-- Hero Section -->
          <section class="relative overflow-hidden px-6 py-20 lg:py-32 transition-colors ${
            isDark
              ? 'bg-gradient-to-br from-[var(--lp-primary)] to-[var(--lp-accent)] text-white'
              : 'bg-gradient-to-br from-white via-[var(--lp-secondary)]/10 to-slate-55 text-slate-900 border-b border-slate-100'
          }">
            <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.07),transparent_70%)]"></div>
            <div class="relative mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div class="lg:col-span-7 space-y-6 text-center lg:text-left">
                ${badgeHtml}
                <h1 class="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">${escapeHTML(hs.headline)}</h1>
                <p class="text-lg leading-relaxed max-w-xl mx-auto lg:mx-0 ${isDark ? 'text-white/80' : 'text-slate-600'}">${escapeHTML(hs.subheadline)}</p>
                <div class="flex flex-wrap gap-3 justify-center lg:justify-start pt-2">
                  ${primaryCtaBtn}
                  ${secondaryCtaBtn}
                </div>
                ${trustSignalsHtml}
              </div>
              <div class="lg:col-span-5 flex justify-center">
                ${visualContent}
              </div>
            </div>
          </section>
        `;
      }
      case 'stats': {
        const ss = s as LandingPageStatsSection;
        const headingHtml = ss.heading ? `<h2 class="text-center text-xl font-bold text-[var(--lp-primary)] mb-8">${escapeHTML(ss.heading)}</h2>` : '';
        const itemsHtml = ss.items.map(item => `
          <div class="space-y-1">
            <div class="text-3xl sm:text-4xl font-extrabold text-[var(--lp-primary)]">${escapeHTML(item.value)}</div>
            <div class="text-xs sm:text-sm font-medium ${isDark ? 'text-slate-450' : 'text-slate-600'}">${escapeHTML(item.label)}</div>
          </div>
        `).join('');

        return `
          <!-- Stats Section -->
          <section class="px-6 py-12 border-y transition-colors ${
            isDark
              ? 'bg-slate-900 border-slate-800 text-white'
              : 'bg-[var(--lp-secondary)]/25 border-[var(--lp-primary)]/5 text-slate-900'
          }">
            <div class="mx-auto max-w-5xl">
              ${headingHtml}
              <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                ${itemsHtml}
              </div>
            </div>
          </section>
        `;
      }
      case 'features': {
        const fs = s as LandingPageFeaturesSection;
        const subheadingHtml = fs.subheading ? `<p class="mt-3 max-w-xl mx-auto text-sm sm:text-base ${isDark ? 'text-slate-400' : 'text-slate-500'}">${escapeHTML(fs.subheading)}</p>` : '';
        const itemsHtml = fs.items.map(item => `
          <div class="rounded-2xl border p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-3 ${
            isDark
              ? 'bg-slate-900 border-slate-800/80 text-white'
              : 'bg-white border-slate-100 text-slate-900'
          }">
            <span class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--lp-secondary)]/30 text-2xl">${escapeHTML(item.icon)}</span>
            <h3 class="font-bold text-base leading-snug">${escapeHTML(item.title)}</h3>
            <p class="text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-650'}">${escapeHTML(item.description)}</p>
          </div>
        `).join('');

        let layoutHtml = '';
        if (fs.image_url) {
          layoutHtml = `
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div class="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
                ${itemsHtml}
              </div>
              <div class="lg:col-span-5 flex justify-center">
                <img src="${escapeHTML(fs.image_url)}" alt="${escapeHTML(fs.heading)}" class="w-full max-w-md aspect-[4/3] object-cover rounded-2xl shadow-xl border ${isDark ? 'border-white/20' : 'border-slate-200/80'}" />
              </div>
            </div>
          `;
        } else {
          layoutHtml = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
              ${itemsHtml}
            </div>
          `;
        }

        return `
          <!-- Features Section -->
          <section class="px-6 py-16 sm:py-24 transition-colors ${isDark ? 'bg-slate-950' : 'bg-slate-55'}">
            <div class="mx-auto max-w-5xl">
              <div class="text-center mb-12">
                <h2 class="text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}">${escapeHTML(fs.heading)}</h2>
                ${subheadingHtml}
              </div>
              ${layoutHtml}
            </div>
          </section>
        `;
      }
      case 'benefits': {
        const bs = s as LandingPageBenefitsSection;
        const subheadingHtml = bs.subheading ? `<p class="mt-3 max-w-xl mx-auto text-sm sm:text-base ${isDark ? 'text-slate-400' : 'text-slate-550'}">${escapeHTML(bs.subheading)}</p>` : '';
        const itemsHtml = bs.items.map((item, i) => {
          const iconHtml = item.icon
            ? `<span class="mt-0.5 shrink-0 text-xl">${escapeHTML(item.icon)}</span>`
            : `<span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--lp-primary)] text-white text-xs font-bold">${i + 1}</span>`;
          return `
            <div class="flex gap-4 p-5 rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-white'
                : 'bg-white border-slate-100 text-slate-900'
            }">
              ${iconHtml}
              <div>
                <h3 class="font-bold text-base leading-snug">${escapeHTML(item.title)}</h3>
                <p class="mt-1 text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}">${escapeHTML(item.description)}</p>
              </div>
            </div>
          `;
        }).join('');

        let layoutHtml = '';
        if (bs.image_url) {
          layoutHtml = `
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div class="lg:col-span-7 space-y-4">
                ${itemsHtml}
              </div>
              <div class="lg:col-span-5 flex justify-center">
                <img src="${escapeHTML(bs.image_url)}" alt="${escapeHTML(bs.heading)}" class="w-full max-w-md aspect-[4/3] object-cover rounded-2xl shadow-xl border ${isDark ? 'border-white/20' : 'border-slate-200/80'}" />
              </div>
            </div>
          `;
        } else {
          layoutHtml = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              ${itemsHtml}
            </div>
          `;
        }

        return `
          <!-- Benefits Section -->
          <section class="px-6 py-16 sm:py-24 transition-colors ${isDark ? 'bg-slate-900' : 'bg-white'}">
            <div class="mx-auto max-w-5xl">
              <div class="text-center mb-12">
                <h2 class="text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}">${escapeHTML(bs.heading)}</h2>
                ${subheadingHtml}
              </div>
              ${layoutHtml}
            </div>
          </section>
        `;
      }
      case 'how-it-works': {
        const hws = s as LandingPageHowItWorksSection;
        const subheadingHtml = hws.subheading ? `<p class="mt-3 max-w-xl mx-auto text-sm sm:text-base ${isDark ? 'text-slate-400' : 'text-slate-500'}">${escapeHTML(hws.subheading)}</p>` : '';
        const stepsHtml = hws.steps.map((step, i) => `
          <div class="flex gap-5 items-start">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lp-primary)] text-white font-bold text-sm shadow-md">
              ${i + 1}
            </div>
            <div class="pb-8 border-b flex-1 last:border-0 last:pb-0 ${isDark ? 'border-slate-800' : 'border-slate-100'}">
              <h3 class="font-bold text-base sm:text-lg leading-snug ${isDark ? 'text-white' : 'text-slate-900'}">${escapeHTML(step.title)}</h3>
              <p class="mt-2 text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}">${escapeHTML(step.description)}</p>
            </div>
          </div>
        `).join('');

        return `
          <!-- How It Works Section -->
          <section class="px-6 py-16 sm:py-24 transition-colors ${isDark ? 'bg-slate-950' : 'bg-slate-50'}">
            <div class="mx-auto max-w-3xl">
              <div class="text-center mb-12">
                <h2 class="text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}">${escapeHTML(hws.heading)}</h2>
                ${subheadingHtml}
              </div>
              <div class="relative space-y-6">
                ${stepsHtml}
              </div>
            </div>
          </section>
        `;
      }
      case 'testimonials': {
        const ts = s as LandingPageTestimonialsSection;
        const itemsHtml = ts.items.map(t => `
          <div class="rounded-2xl border p-6 shadow-sm flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow ${
            isDark
              ? 'bg-slate-955 border-slate-800 text-white'
              : 'bg-white border-slate-100 text-slate-900'
          }">
            <div class="space-y-3">
              <div class="flex text-amber-400 gap-0.5">
                <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
              </div>
              <p class="text-xs sm:text-sm leading-relaxed italic ${isDark ? 'text-slate-350' : 'text-slate-700'}">"${escapeHTML(t.quote)}"</p>
            </div>
            <div class="pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}">
              <div class="font-bold text-xs sm:text-sm">${escapeHTML(t.author)}</div>
              <div class="text-[10px] sm:text-xs text-slate-550">${escapeHTML(t.role)}${t.company ? `, ${escapeHTML(t.company)}` : ''}</div>
            </div>
          </div>
        `).join('');

        return `
          <!-- Testimonials Section -->
          <section class="px-6 py-16 sm:py-24 transition-colors ${isDark ? 'bg-slate-900' : 'bg-white'}">
            <div class="mx-auto max-w-5xl">
              <h2 class="text-center text-2xl sm:text-3xl font-bold mb-12 ${isDark ? 'text-white' : 'text-slate-900'}">${escapeHTML(ts.heading)}</h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                ${itemsHtml}
              </div>
            </div>
          </section>
        `;
      }
      case 'faq': {
        const faqs = s as LandingPageFaqSection;
        const itemsHtml = faqs.items.map((faq, i) => `
          <div class="rounded-xl border overflow-hidden shadow-sm transition-colors ${
            isDark
              ? 'bg-slate-900 border-slate-800 text-white'
              : 'bg-white border-slate-200 text-slate-900'
          }">
            <button
              onclick="toggleFaq(${i})"
              class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold transition-colors ${
                isDark ? 'hover:bg-slate-850' : 'hover:bg-slate-55'
              }"
            >
              <span class="text-xs sm:text-sm">${escapeHTML(faq.question)}</span>
              <span id="faq-icon-${i}" class="text-[var(--lp-primary)] shrink-0 text-lg font-bold">+</span>
            </button>
            <div id="faq-content-${i}" class="hidden px-5 pb-4 text-xs sm:text-sm leading-relaxed border-t pt-3 ${
              isDark ? 'text-slate-400 border-slate-800' : 'text-slate-600 border-slate-100'
            }">
              ${escapeHTML(faq.answer)}
            </div>
          </div>
        `).join('');

        return `
          <!-- FAQ Section -->
          <section class="px-6 py-16 sm:py-24 transition-colors ${isDark ? 'bg-slate-950' : 'bg-slate-55'}">
            <div class="mx-auto max-w-3xl">
              <h2 class="text-2xl sm:text-3xl font-bold mb-8 text-center ${isDark ? 'text-white' : 'text-slate-900'}">${escapeHTML(faqs.heading)}</h2>
              <div class="space-y-3">
                ${itemsHtml}
              </div>
            </div>
          </section>
        `;
      }
      case 'cta': {
        const cs = s as LandingPageCtaSection;
        const subheadingHtml = cs.subheading ? `<p class="text-base sm:text-lg max-w-xl mx-auto leading-relaxed ${isDark ? 'text-white/80' : 'text-slate-600'}">${escapeHTML(cs.subheading)}</p>` : '';
        
        const primaryCtaBtn = renderCtaButtonHtml({
          text: cs.cta_primary,
          className: isDark
            ? 'bg-white text-[var(--lp-primary)] hover:shadow-xl px-8 py-3 text-sm font-bold'
            : 'bg-[var(--lp-primary)] text-white hover:shadow-xl px-8 py-3 text-sm font-bold',
          ctaLink,
          buttonStyle,
        });

        const secondaryCtaBtn = cs.cta_secondary
          ? renderCtaButtonHtml({
              text: cs.cta_secondary,
              className: isDark
                ? 'border border-white/50 hover:bg-white/10 px-8 py-3 text-sm font-semibold text-white/90'
                : 'border border-[var(--lp-primary)]/30 hover:bg-[var(--lp-primary)]/5 px-8 py-3 text-sm font-semibold text-[var(--lp-primary)]',
              ctaLink,
              buttonStyle,
            })
          : '';

        return `
          <!-- CTA Section -->
          <section class="px-6 py-20 text-center relative overflow-hidden transition-colors ${
            isDark
              ? 'bg-gradient-to-br from-[var(--lp-primary)] to-[var(--lp-accent)] text-white'
              : 'bg-gradient-to-br from-white via-[var(--lp-secondary)]/20 to-slate-55 text-slate-900 border-t border-slate-100'
          }">
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(255,255,255,0.06),transparent_50%)]"></div>
            <div class="relative mx-auto max-w-3xl space-y-6">
              <h2 class="text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight">${escapeHTML(cs.heading)}</h2>
              ${subheadingHtml}
              <div class="flex flex-wrap gap-3 justify-center pt-2">
                ${primaryCtaBtn}
                ${secondaryCtaBtn}
              </div>
            </div>
          </section>
        `;
      }
      default:
        return '';
    }
  }).join('\n');

  const googleFontsLink = getGoogleFontsLink(fontStack);
  const fontFamilyName = getFontFamilyName(fontStack);

  const rawHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(data.meta_title || data.company_name)}</title>
  <meta name="description" content="${escapeHTML(data.meta_description || '')}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${googleFontsLink}
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['${fontFamilyName}', 'sans-serif'],
          },
          colors: {
            brand: {
              primary: 'var(--lp-primary, #7c3aed)',
              secondary: 'var(--lp-secondary, #e0d9ff)',
              accent: 'var(--lp-accent, #4f46e5)',
            }
          }
        }
      }
    }
  </script>
  <style>
    :root {
      --lp-primary: ${primaryColor};
      --lp-secondary: ${secondaryColor};
      --lp-accent: ${accentColor};
    }
    body {
      font-family: '${fontFamilyName}', sans-serif;
    }
  </style>
</head>
<body class="antialiased selection:bg-brand-primary selection:text-white ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}">

  <main>
    ${sectionsHtml}
  </main>

  <!-- Footer -->
  <footer class="border-t px-6 py-12 text-center text-xs space-y-4 transition-colors ${
    isDark
      ? 'border-slate-850 bg-slate-950 text-slate-400'
      : 'border-slate-150 bg-slate-100 text-slate-500'
  }">
    <div class="flex items-center justify-center gap-2">
      ${project?.brand_logo_url ? `<img src="${escapeHTML(project.brand_logo_url)}" alt="${escapeHTML(companyName)}" class="h-6 object-contain grayscale opacity-60" />` : `<span class="font-bold">${escapeHTML(companyName)}</span>`}
    </div>
    <p class="max-w-md mx-auto leading-relaxed">
      Supporting SEO landing page for ${escapeHTML(project?.domain || '')}. Optimized for search intent: <i>"${escapeHTML(data.primary_keyword)}"</i>.
    </p>
    <p class="text-[10px]">© ${new Date().getFullYear()} ${escapeHTML(companyName)}. All rights reserved.</p>
  </footer>

  <script>
    function toggleFaq(index) {
      const content = document.getElementById('faq-content-' + index);
      const icon = document.getElementById('faq-icon-' + index);
      if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        icon.textContent = '−';
      } else {
        content.classList.add('hidden');
        icon.textContent = '+';
      }
    }
  </script>
</body>
</html>
`;

  return rawHtml.replace(/\*\*(.*?)\*\*/g, '<span class="text-[var(--lp-accent)] font-extrabold">$1</span>');
}

export function exportLandingPageToReact(
  data: LandingPageContentData,
  project: Project | null
): string {
  const primaryColor = project?.brand_primary_color || '#7c3aed';
  const secondaryColor = project?.brand_secondary_color || '#e0d9ff';
  const accentColor = project?.brand_accent_color || '#4f46e5';
  const fontStack = project?.brand_font_family || 'Inter, sans-serif';
  const isDark = project?.brand_theme === 'dark';
  const ctaLink = project?.brand_cta_link || null;
  const buttonStyle = project?.brand_button_style || 'rounded-full';
  const companyName = data.company_name || project?.name || 'Studio';

  const sectionsCode = data.sections.map((s) => {
    switch (s.type) {
      case 'hero': {
        const hs = s as LandingPageHeroSection;
        const primaryCtaBtn = renderCtaButtonReact({
          text: hs.cta_primary,
          className: isDark
            ? 'bg-white text-[var(--lp-primary)] hover:shadow-lg px-7 py-3 text-sm font-bold'
            : 'bg-[var(--lp-primary)] text-white hover:shadow-lg px-7 py-3 text-sm font-bold',
          ctaLink,
          buttonStyle,
        });

        const secondaryCtaBtn = hs.cta_secondary
          ? renderCtaButtonReact({
              text: hs.cta_secondary,
              className: isDark
                ? 'border border-white/50 hover:bg-white/10 px-7 py-3 text-sm font-semibold text-white'
                : 'border border-[var(--lp-primary)]/30 hover:bg-[var(--lp-primary)]/5 px-7 py-3 text-sm font-semibold text-[var(--lp-primary)]',
              ctaLink,
              buttonStyle,
            })
          : '';

        const visualContent = hs.image_url
          ? `<img src="${hs.image_url}" alt="${hs.headline}" className={"w-full max-w-md aspect-[4/3] object-cover rounded-2xl shadow-2xl border " + (${isDark ? '"border-white/20"' : '"border-slate-200/80"'})} />`
          : `
            {/* Visual Card */}
            <div className={"relative w-full max-w-md aspect-square rounded-2xl p-6 shadow-2xl flex flex-col justify-between overflow-hidden border " + (${isDark ? '"bg-white/10 border-white/20 text-white backdrop-blur-md"' : '"bg-white border-slate-200/80 text-slate-800"'})}>
              <div className={"absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full blur-3xl " + (${isDark ? '"bg-[var(--lp-secondary)]/25"' : '"bg-[var(--lp-secondary)]/10"'})} />
              <div className={"flex items-center justify-between border-b pb-4 " + (${isDark ? '"border-white/15"' : '"border-slate-100"'})}>
                <div className="flex gap-1.5">
                  <span className={"w-2.5 h-2.5 rounded-full " + (${isDark ? '"bg-white/40"' : '"bg-slate-350"'})} />
                  <span className={"w-2.5 h-2.5 rounded-full " + (${isDark ? '"bg-white/40"' : '"bg-slate-350"'})} />
                  <span className={"w-2.5 h-2.5 rounded-full " + (${isDark ? '"bg-white/40"' : '"bg-slate-350"'})} />
                </div>
                <span className={"text-[10px] font-mono tracking-wider " + (${isDark ? '"text-white/50"' : '"text-slate-400"'})}>SEO SUPPORTING PAGE</span>
              </div>
              <div className="my-auto space-y-4 text-center">
                <div className={"inline-flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-inner border " + (${isDark ? '"bg-white/10 border-white/20"' : '"bg-slate-50 border-slate-100"'})}>🎯</div>
                <h3 className="text-lg font-bold">${data.primary_keyword}</h3>
                <p className={"text-xs leading-relaxed max-w-xs mx-auto " + (${isDark ? '"text-white/70"' : '"text-slate-500"'})}>Optimized for Google search intent and fully integrated with the company brand colors.</p>
              </div>
              <div className={"border-t pt-4 flex items-center justify-between text-[11px] " + (${isDark ? '"border-white/10 text-white/60"' : '"border-slate-100 text-slate-400"'})}>
                <span>${companyName} Landing Page</span>
                <span>Responsive Design</span>
              </div>
            </div>
          `;

        return `
      {/* Hero Section */}
      <section className={"relative overflow-hidden px-6 py-20 lg:py-32 transition-colors " + (${isDark ? '"bg-gradient-to-br from-[var(--lp-primary)] to-[var(--lp-accent)] text-white"' : '"bg-gradient-to-br from-white via-[var(--lp-secondary)]/10 to-slate-50 text-slate-900 border-b border-slate-100"'})}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.07),transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            ${hs.badge ? `<span className={"inline-block px-4 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur mb-4 border " + (${isDark ? '"border-white/30 bg-white/15 text-white"' : '"border-[var(--lp-primary)]/20 bg-[var(--lp-primary)]/5 text-[var(--lp-primary)]"'})}>${hs.badge}</span>` : ''}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">${hs.headline}</h1>
            <p className={"text-lg leading-relaxed max-w-xl mx-auto lg:mx-0 " + (${isDark ? '"text-white/80"' : '"text-slate-600"'})}>${hs.subheadline}</p>
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start pt-2">
              ${primaryCtaBtn}
              ${secondaryCtaBtn}
            </div>
            ${hs.trust_signals?.length ? `
            <div className={"flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-4 text-xs " + (${isDark ? '"text-white/60"' : '"text-slate-400"'})}>
              ${hs.trust_signals.map(t => `<span className="flex items-center gap-1.5"><span className={${isDark ? '"text-white"' : '"text-[var(--lp-primary)]"'}}>✓</span> ${t}</span>`).join('\n              ')}
            </div>` : ''}
          </div>
          <div className="lg:col-span-5 flex justify-center">
            ${visualContent}
          </div>
        </div>
      </section>
        `;
      }
      case 'stats': {
        const ss = s as LandingPageStatsSection;
        return `
      {/* Stats Section */}
      <section className={"px-6 py-12 border-y transition-colors " + (${isDark ? '"bg-slate-900 border-slate-800 text-white"' : '"bg-[var(--lp-secondary)]/20 border-[var(--lp-primary)]/5 text-slate-900"'})}>
        <div className="mx-auto max-w-5xl">
          ${ss.heading ? `<h2 className="text-center text-xl font-bold text-[var(--lp-primary)] mb-8">${ss.heading}</h2>` : ''}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            ${ss.items.map(item => `<div>
              <div className="text-3xl sm:text-4xl font-extrabold text-[var(--lp-primary)]">${item.value}</div>
              <div className={"text-xs sm:text-sm font-medium " + (${isDark ? '"text-slate-400"' : '"text-slate-600"'})}>${item.label}</div>
            </div>`).join('\n            ')}
          </div>
        </div>
      </section>
        `;
      }
      case 'features': {
        const fs = s as LandingPageFeaturesSection;
        const itemsListCode = fs.items.map(item => `<div className={"rounded-2xl border p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-3 " + (${isDark ? '"bg-slate-900 border-slate-800/80"' : '"bg-white border-slate-100"'})}>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--lp-secondary)]/30 text-2xl">${item.icon}</span>
              <h3 className="font-bold text-base leading-snug">${item.title}</h3>
              <p className={"text-xs sm:text-sm leading-relaxed " + (${isDark ? '"text-slate-400"' : '"text-slate-600"'})}>${item.description}</p>
            </div>`).join('\n            ');

        let layoutCode = '';
        if (fs.image_url) {
          layoutCode = `
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
              ${itemsListCode}
            </div>
            <div className="lg:col-span-5 flex justify-center">
              <img src="${fs.image_url}" alt="${fs.heading}" className={"w-full max-w-md aspect-[4/3] object-cover rounded-2xl shadow-xl border " + (${isDark ? '"border-white/20"' : '"border-slate-200/80"'})} />
            </div>
          </div>
          `;
        } else {
          layoutCode = `
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            ${itemsListCode}
          </div>
          `;
        }

        return `
      {/* Features Section */}
      <section className={"px-6 py-16 sm:py-24 transition-colors " + (${isDark ? '"bg-slate-950 text-white"' : '"bg-slate-50 text-slate-900"'})}>
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold">{fs.heading}</h2>
            ${fs.subheading ? `<p className={"mt-3 max-w-xl mx-auto text-sm sm:text-base " + (${isDark ? '"text-slate-400"' : '"text-slate-500"'})}>${fs.subheading}</p>` : ''}
          </div>
          ${layoutCode}
        </div>
      </section>
        `;
      }
      case 'benefits': {
        const bs = s as LandingPageBenefitsSection;
        const itemsListCode = bs.items.map((item, i) => `<div className={"flex gap-4 p-5 rounded-2xl border shadow-sm hover:shadow-md transition-shadow " + (${isDark ? '"bg-slate-955 border-slate-800"' : '"bg-white border-slate-100"'})}>
              ${item.icon ? `<span className="mt-0.5 shrink-0 text-xl">${item.icon}</span>` : `<span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--lp-primary)] text-white text-xs font-bold">${i + 1}</span>`}
              <div>
                <h3 className="font-bold text-base leading-snug">${item.title}</h3>
                <p className={"mt-1 text-xs sm:text-sm leading-relaxed " + (${isDark ? '"text-slate-400"' : '"text-slate-650"'})}>${item.description}</p>
              </div>
            </div>`).join('\n            ');

        let layoutCode = '';
        if (bs.image_url) {
          layoutCode = `
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-4">
              ${itemsListCode}
            </div>
            <div className="lg:col-span-5 flex justify-center">
              <img src="${bs.image_url}" alt="${bs.heading}" className={"w-full max-w-md aspect-[4/3] object-cover rounded-2xl shadow-xl border " + (${isDark ? '"border-white/20"' : '"border-slate-200/80"'})} />
            </div>
          </div>
          `;
        } else {
          layoutCode = `
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${itemsListCode}
          </div>
          `;
        }

        return `
      {/* Benefits Section */}
      <section className={"px-6 py-16 sm:py-24 transition-colors " + (${isDark ? '"bg-slate-900 text-white"' : '"bg-white text-slate-900"'})}>
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold">{bs.heading}</h2>
            ${bs.subheading ? `<p className={"mt-3 max-w-xl mx-auto text-sm sm:text-base " + (${isDark ? '"text-slate-400"' : '"text-slate-500"'})}>${bs.subheading}</p>` : ''}
          </div>
          ${layoutCode}
        </div>
      </section>
        `;
      }
      case 'how-it-works': {
        const hws = s as LandingPageHowItWorksSection;
        return `
      {/* How It Works Section */}
      <section className={"px-6 py-16 sm:py-24 transition-colors " + (${isDark ? '"bg-slate-950 text-white"' : '"bg-slate-50 text-slate-900"'})}>
        <div className="mx-auto max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold">{hws.heading}</h2>
            ${hws.subheading ? `<p className={"mt-3 max-w-xl mx-auto text-sm sm:text-base " + (${isDark ? '"text-slate-400"' : '"text-slate-500"'})}>${hws.subheading}</p>` : ''}
          </div>
          <div className="relative space-y-6">
            ${hws.steps.map((step, i) => `<div className="flex gap-5 items-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lp-primary)] text-white font-bold text-sm shadow-md">
                {i + 1}
              </div>
              <div className={"pb-8 border-b flex-1 last:border-0 last:pb-0 " + (${isDark ? '"border-slate-800"' : '"border-slate-100"'})}>
                <h3 className="font-bold text-base sm:text-lg leading-snug">${step.title}</h3>
                <p className={"mt-2 text-xs sm:text-sm leading-relaxed " + (${isDark ? '"text-slate-400"' : '"text-slate-600"'})}>${step.description}</p>
              </div>
            </div>`).join('\n            ')}
          </div>
        </div>
      </section>
        `;
      }
      case 'testimonials': {
        const ts = s as LandingPageTestimonialsSection;
        return `
      {/* Testimonials Section */}
      <section className={"px-6 py-16 sm:py-24 transition-colors " + (${isDark ? '"bg-slate-900 text-white"' : '"bg-white text-slate-900"'})}>
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl sm:text-3xl font-bold mb-12">{ts.heading}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${ts.items.map(t => `<div className={"rounded-2xl border p-6 shadow-sm flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow " + (${isDark ? '"bg-slate-950 border-slate-800"' : '"bg-white border-slate-100"'})}>
              <div className="space-y-3">
                <div className="flex text-amber-400 gap-0.5">
                  <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
                </div>
                <p className={"text-xs sm:text-sm leading-relaxed italic " + (${isDark ? '"text-slate-350"' : '"text-slate-700"'})}>"${t.quote}"</p>
              </div>
              <div className={"pt-2 border-t " + (${isDark ? '"border-slate-800"' : '"border-slate-100"'})}>
                <div className="font-bold text-xs sm:text-sm">${t.author}</div>
                <div className="text-[10px] sm:text-xs text-slate-500">${t.role}${t.company ? `, \${t.company}` : ''}</div>
              </div>
            </div>`).join('\n            ')}
          </div>
        </div>
      </section>
        `;
      }
      case 'faq': {
        const faqs = s as LandingPageFaqSection;
        return `
      {/* FAQ Section */}
      <section className={"px-6 py-16 sm:py-24 transition-colors " + (${isDark ? '"bg-slate-955 text-white"' : '"bg-slate-50 text-slate-900"'})}>
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{faqs.heading}</h2>
          <div className="space-y-3">
            ${faqs.items.map((faq, i) => `<div className={"rounded-xl border overflow-hidden shadow-sm transition-colors " + (${isDark ? '"bg-slate-900 border-slate-800"' : '"bg-white border-slate-200"'})}>
              <button
                onClick={() => setOpenFaq(openFaq === ${i} ? null : ${i})}
                className={"flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold transition-colors " + (${isDark ? '"hover:bg-slate-850"' : '"hover:bg-slate-55"'})}
              >
                <span className="text-xs sm:text-sm">${faq.question}</span>
                <span className="text-[var(--lp-primary)] shrink-0 text-lg font-bold">
                  {openFaq === ${i} ? '−' : '+'}
                </span>
              </button>
              {openFaq === ${i} && (
                <div className={"px-5 pb-4 text-xs sm:text-sm leading-relaxed border-t pt-3 " + (${isDark ? '"text-slate-400 border-slate-800"' : '"text-slate-600 border-slate-100"'})}>
                  {${JSON.stringify(faq.answer)}}
                </div>
              )}
            </div>`).join('\n            ')}
          </div>
        </div>
      </section>
        `;
      }
      case 'cta': {
        const cs = s as LandingPageCtaSection;
        const primaryCtaBtn = renderCtaButtonReact({
          text: cs.cta_primary,
          className: isDark
            ? 'bg-white text-[var(--lp-primary)] hover:shadow-xl px-8 py-3 text-sm font-bold'
            : 'bg-[var(--lp-primary)] text-white hover:shadow-xl px-8 py-3 text-sm font-bold',
          ctaLink,
          buttonStyle,
        });

        const secondaryCtaBtn = cs.cta_secondary
          ? renderCtaButtonReact({
              text: cs.cta_secondary,
              className: isDark
                ? 'border border-white/50 hover:bg-white/10 px-8 py-3 text-sm font-semibold text-white/90'
                : 'border border-[var(--lp-primary)]/30 hover:bg-[var(--lp-primary)]/5 px-8 py-3 text-sm font-semibold text-[var(--lp-primary)]',
              ctaLink,
              buttonStyle,
            })
          : '';

        return `
      {/* CTA Section */}
      <section className={"px-6 py-20 text-center relative overflow-hidden transition-colors " + (${isDark ? '"bg-gradient-to-br from-[var(--lp-primary)] to-[var(--lp-accent)] text-white"' : '"bg-gradient-to-br from-white via-[var(--lp-secondary)]/20 to-slate-50 text-slate-900 border-t border-slate-100"'})}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(255,255,255,0.06),transparent_50%)]" />
        <div className="relative mx-auto max-w-3xl space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight">${cs.heading}</h2>
          ${cs.subheading ? `<p className={"text-base sm:text-lg max-w-xl mx-auto leading-relaxed " + (${isDark ? '"text-white/80"' : '"text-slate-600"'})}>${cs.subheading}</p>` : ''}
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            ${primaryCtaBtn}
            ${secondaryCtaBtn}
          </div>
        </div>
      </section>
        `;
      }
      default:
        return '';
    }
  }).join('\n');

  const footerLogoReact = project?.brand_logo_url
    ? `<img src="${project.brand_logo_url}" alt="${companyName}" className="h-6 object-contain grayscale opacity-60" />`
    : `<span className="font-bold text-slate-600">${companyName}</span>`;

  const fontName = getFontFamilyName(fontStack);

  const rawReact = `import React, { useState } from 'react';

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div
      className={"antialiased selection:bg-[var(--lp-primary)] selection:text-white " + (${isDark ? '"bg-slate-950 text-white"' : '"bg-slate-55 text-slate-900"'})}
      style={{
        '--lp-primary': '${primaryColor}',
        '--lp-secondary': '${secondaryColor}',
        '--lp-accent': '${accentColor}',
        fontFamily: '${fontStack}',
      } as React.CSSProperties}
    >
      {/* Google Fonts Link - copy this to your public/index.html or root layout:
          <link href="https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}&display=swap" rel="stylesheet">
      */}

      <main>
${sectionsCode}
      </main>

      {/* Footer */}
      <footer className={"border-t px-6 py-12 text-center text-xs space-y-4 transition-colors " + (${isDark ? '"border-slate-850 bg-slate-950 text-slate-400"' : '"border-slate-150 bg-slate-100 text-slate-500"'})}>
        <div className="flex items-center justify-center gap-2">
          ${footerLogoReact}
        </div>
        <p className="max-w-md mx-auto leading-relaxed">
          Supporting SEO landing page for ${project?.domain || ''}. Optimized for search intent: <i>"${data.primary_keyword}"</i>.
        </p>
        <p className="text-[10px]">© {new Date().getFullYear()} ${companyName}. All rights reserved.</p>
      </footer>
    </div>
  );
}
`;

  return rawReact.replace(/\*\*(.*?)\*\*/g, '<span className="text-[var(--lp-accent)] font-extrabold">$1</span>');
}
