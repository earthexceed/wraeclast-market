// Vendor
import Component from '@glimmer/component';
import {inject as service} from '@ember/service';
import {action} from '@ember/object';

// Types
import ItemResults from 'better-trading/services/item-results';

// Utilities
import {extensionApi} from 'better-trading/utilities/extension-api';

// Config
import config from 'better-trading/config/environment';

interface Enhancer {
  slug: string;
  isEnabled: boolean;
  translationKey: string;
}

export default class PageAbout extends Component {
  @service('item-results')
  itemResults: ItemResults;

  appVersion = config.APP.version;
  githubUrl = config.APP.githubUrl;

  // Opens the packaged "What's New" page (changelog.html) in a new tab — the background does it
  // (same path as the auto-open on install/update), so no web-accessible-resource is needed.
  @action
  openChangelog() {
    extensionApi().runtime.sendMessage({query: 'open-changelog'}, () => undefined);
  }

  get enhancers(): Enhancer[] {
    return this.itemResults.getEnhancerSlugs().map((slug) => ({
      slug,
      isEnabled: !this.itemResults.disabledEnhancerSlugs.includes(slug || ''),
      translationKey: `page.about.enhancers.${slug}`,
    }));
  }

  @action
  toggleDisabledEnhancerSlug(slug: string, isEnabled: boolean) {
    let updatedDisabledEnhancerSlugs = [...this.itemResults.disabledEnhancerSlugs];

    if (isEnabled) {
      updatedDisabledEnhancerSlugs = updatedDisabledEnhancerSlugs.filter((disabledSlug) => disabledSlug !== slug);
    } else {
      updatedDisabledEnhancerSlugs.push(slug);
    }

    this.itemResults.setDisabledEnhancerSlugs(updatedDisabledEnhancerSlugs);
  }
}
