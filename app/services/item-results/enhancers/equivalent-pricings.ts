// Vendor
import Service, {inject as service} from '@ember/service';

// Types
import TradeLocation from 'better-trading/services/trade-location';
import PoeNinja, {PoeNinjaCurrenciesRatios, Poe2CurrencyData} from 'better-trading/services/poe-ninja';
import {ItemResultsEnhancerService, ItemResultsParsedItem} from 'better-trading/types/item-results';

// Constants
const CHAOS_IMAGE_URL = 'https://web.poecdn.com/image/Art/2DItems/Currency/CurrencyRerollRare.png';
const CHAOS_ALT = 'chaos';
const CHAOS_SLUG = 'chaos-orb';
const NORMALIZED_CURRENCY_IMAGE_URL = 'https://web.poecdn.com/image/Art/2DItems/Currency/CurrencyModValues.png';
const NORMALIZED_CURRENCY_ALT = 'divine';
const NORMALIZED_CURRENCY_SLUG = 'divine-orb';
const NORMALIZED_CURRENCY_EQUIVALENCE_THRESHOLD = 0.5;

// PoE2 reference currencies the price is annotated against (poe.ninja powered).
const POE2_REFERENCE_SLUGS = ['exalted-orb', 'divine-orb', 'chaos-orb', 'orb-of-annulment'];
// Below this magnitude we keep one decimal of precision, otherwise round to int.
const POE2_DECIMAL_THRESHOLD = 10;

export default class EquivalentPricings extends Service implements ItemResultsEnhancerService {
  @service('poe-ninja')
  poeNinja: PoeNinja;

  @service('trade-location')
  tradeLocation: TradeLocation;

  slug = 'equivalent-pricings';

  chaosRatios: PoeNinjaCurrenciesRatios | null;

  poe2Ratios: Poe2CurrencyData | null;

  async prepare() {
    const currentLeague = this.tradeLocation.league;
    const version = this.tradeLocation.version;

    this.chaosRatios = null;
    this.poe2Ratios = null;
    if (!currentLeague) return;

    if (version === '1') {
      this.chaosRatios = await this.poeNinja.fetchChaosRatiosFor(currentLeague);
    } else if (version === '2') {
      this.poe2Ratios = await this.poeNinja.fetchExaltedRatiosFor(currentLeague);
    }
  }

  // eslint-disable-next-line complexity
  enhance(itemElement: HTMLElement, {price}: ItemResultsParsedItem) {
    if (this.poe2Ratios) {
      this.enhancePoe2PricedItem(itemElement, price);
      return;
    }

    if (!this.chaosRatios) return;

    const pricingContainerElement = itemElement.querySelector<HTMLDivElement>('.price');
    const currencyImageElement = itemElement.querySelector<HTMLImageElement>(
      '[data-field="price"] .currency-image img'
    );

    if (!pricingContainerElement || !currencyImageElement || !price.currencySlug || !price.value) return;

    const currencySlug = price.currencySlug;
    const currencyValue = price.value;
    const chaosValue = this.chaosRatios[currencySlug];
    const normalizedCurrencyValue = this.chaosRatios[NORMALIZED_CURRENCY_SLUG];

    if (chaosValue && currencyValue) {
      this.handleNonChaosPricedItem(pricingContainerElement, currencyImageElement, currencyValue, chaosValue);
    } else if (currencySlug === CHAOS_SLUG && normalizedCurrencyValue) {
      this.handleChaosPricedItem(pricingContainerElement, currencyValue, normalizedCurrencyValue);
    }
  }

  private handleNonChaosPricedItem(
    pricingContainerElement: HTMLElement,
    currencyImageElement: HTMLImageElement,
    currencyValue: number,
    chaosValue: number
  ) {
    const chaosEquivalentValue = Math.round(currencyValue * chaosValue);
    if (!chaosEquivalentValue) return;

    pricingContainerElement.append(this.renderChaosEquivalence(chaosEquivalentValue));

    const flooredCurrencyValue = Math.floor(currencyValue);
    if (flooredCurrencyValue === 0 || chaosValue < 1 || flooredCurrencyValue === currencyValue) return;

    const chaosFractionValue = Math.round((currencyValue - flooredCurrencyValue) * chaosValue);
    pricingContainerElement.append(
      this.renderChaosFraction(
        flooredCurrencyValue,
        currencyImageElement.src,
        currencyImageElement.alt,
        chaosFractionValue
      )
    );
  }

  private handleChaosPricedItem(
    pricingContainerElement: HTMLElement,
    currencyValue: number,
    normalizedCurrencyValue: number
  ) {
    if (currencyValue < NORMALIZED_CURRENCY_EQUIVALENCE_THRESHOLD * normalizedCurrencyValue) return;

    // eslint-disable-next-line no-magic-numbers
    const roundNormalizedCurrencyValue = Math.round((currencyValue / normalizedCurrencyValue) * 10) / 10;
    pricingContainerElement.append(this.renderNormalizedCurrencyEquivalence(roundNormalizedCurrencyValue));
  }

  // eslint-disable-next-line complexity
  private enhancePoe2PricedItem(itemElement: HTMLElement, price: ItemResultsParsedItem['price']) {
    if (!this.poe2Ratios) return;

    const pricingContainerElement = itemElement.querySelector<HTMLDivElement>('.price');
    if (!pricingContainerElement || !price.currencySlug || !price.value) return;

    const pricedCurrency = this.poe2Ratios[price.currencySlug];
    if (!pricedCurrency) return;

    const itemValueInReference = price.value * pricedCurrency.value;

    // Collect the equivalences in their own block so they read as a separate
    // "≈ X = Y = Z" group on its own line, instead of chaining onto the trade
    // site's native "Asking Price" / "Fee" text right before them (the Fee is a
    // gold amount, unrelated to these currency conversions). The first pill leads
    // with "≈" (an approximation of the asking price); the rest use "=" (the same
    // value re-expressed across currencies).
    const group = window.document.createElement('span');
    group.classList.add('bt-equivalent-pricings-group');

    POE2_REFERENCE_SLUGS.forEach((referenceSlug) => {
      const equivalenceElement = this.buildPoe2Equivalence(
        this.poe2Ratios as Poe2CurrencyData,
        referenceSlug,
        price.currencySlug,
        itemValueInReference,
        group.childElementCount === 0 ? '≈' : '='
      );
      if (equivalenceElement) group.append(equivalenceElement);
    });

    if (group.childElementCount > 0) pricingContainerElement.append(group);
  }

  private buildPoe2Equivalence(
    ratios: Poe2CurrencyData,
    referenceSlug: string,
    pricedSlug: string | null,
    itemValueInReference: number,
    connector: string
  ): HTMLElement | null {
    if (referenceSlug === pricedSlug) return null;

    const referenceCurrency = ratios[referenceSlug];
    if (!referenceCurrency || !referenceCurrency.value) return null;

    const equivalentValue = this.roundPoe2Equivalent(itemValueInReference / referenceCurrency.value);
    if (!equivalentValue) return null;

    return this.renderPoe2Equivalence(equivalentValue, referenceCurrency.icon, referenceSlug, connector);
  }

  private roundPoe2Equivalent(value: number): number {
    // eslint-disable-next-line no-magic-numbers
    return value >= POE2_DECIMAL_THRESHOLD ? Math.round(value) : Math.round(value * 10) / 10;
  }

  private renderPoe2Equivalence(
    equivalentValue: number,
    currencyIconUrl: string,
    currencyAlt: string,
    connector: string
  ): HTMLElement {
    return this.buildEquivalenceElement(
      'bt-equivalent-pricings-equivalent',
      [{value: `${equivalentValue}×`, src: currencyIconUrl, alt: currencyAlt}],
      connector
    );
  }

  private renderChaosEquivalence(chaosEquivalentValue: number): HTMLElement {
    return this.buildEquivalenceElement('bt-equivalent-pricings-equivalent', [
      {value: `${chaosEquivalentValue}×`, src: CHAOS_IMAGE_URL, alt: CHAOS_ALT},
    ]);
  }

  private renderChaosFraction(
    flooredCurrencyValue: number,
    currencyIconUrl: string,
    currencyIconAlt: string,
    chaosFractionValue: number
  ): HTMLElement {
    return this.buildEquivalenceElement('bt-equivalent-pricings-chaos-fraction', [
      {value: `${flooredCurrencyValue}×`, src: currencyIconUrl, alt: currencyIconAlt},
      {value: `+${chaosFractionValue}×`, src: CHAOS_IMAGE_URL, alt: CHAOS_ALT},
    ]);
  }

  private renderNormalizedCurrencyEquivalence(normalizedCurrencyValue: number): HTMLElement {
    return this.buildEquivalenceElement('bt-equivalent-pricings-equivalent', [
      {value: `${normalizedCurrencyValue}×`, src: NORMALIZED_CURRENCY_IMAGE_URL, alt: NORMALIZED_CURRENCY_ALT},
    ]);
  }

  // Builds the equivalence pill via the DOM API (never innerHTML) so currency
  // icon URLs/alts — sourced from poe.ninja and the trade page DOM (untrusted) —
  // cannot break out of an attribute or inject markup.
  private buildEquivalenceElement(
    modifierClass: string,
    parts: Array<{value: string; src: string; alt: string}>,
    connector = '='
  ): HTMLElement {
    const element = window.document.createElement('span');
    element.classList.add('bt-equivalent-pricings', modifierClass);

    const inner = window.document.createElement('span');

    const equals = window.document.createElement('span');
    equals.classList.add('bt-equivalent-pricings-equals');
    equals.textContent = connector;
    inner.appendChild(equals);

    parts.forEach(({value, src, alt}) => {
      inner.appendChild(window.document.createTextNode(value));
      const img = window.document.createElement('img');
      img.src = src;
      img.alt = alt;
      inner.appendChild(img);
    });

    element.appendChild(inner);
    return element;
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/equivalent-pricings': EquivalentPricings;
  }
}
