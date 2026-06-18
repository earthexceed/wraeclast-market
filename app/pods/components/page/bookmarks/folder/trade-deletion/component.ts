// Vendor
import Component from '@glimmer/component';

// Types
import {BookmarksTradeStruct} from 'better-trading/types/bookmarks';

// Utilities
import {escapeHtml} from 'better-trading/utilities/escape-html';

interface Args {
  trade: BookmarksTradeStruct;
  onCancel: () => void;
  submitTask: any;
}

export default class TradeDeletion extends Component<Args> {
  // The confirmation message is rendered html-safe (it contains <strong>), so the
  // user-controlled trade title must be escaped to avoid HTML injection.
  get escapedTitle(): string {
    return escapeHtml(this.args.trade.title || '');
  }
}
