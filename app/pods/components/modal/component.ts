// Vendor
import Component from '@glimmer/component';
import {action} from '@ember/object';

interface Args {
  title: string;
  onClose: () => {};
}

export default class Modal extends Component<Args> {
  @action
  bindEscapeKey() {
    document.body.addEventListener('keyup', this.handleKeyup);
  }

  @action
  unbindEscapeKey() {
    document.body.removeEventListener('keyup', this.handleKeyup);
  }

  // Arrow-function class field so add/removeEventListener share one stable
  // reference (bind() would create a new function each call, leaking listeners).
  private handleKeyup = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;

    this.args.onClose();
  };
}
