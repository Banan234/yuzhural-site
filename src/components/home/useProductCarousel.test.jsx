// @vitest-environment jsdom
import '../../test/renderTestSetup.js';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useProductCarousel from './useProductCarousel';

const products = Array.from({ length: 6 }, (_, id) => ({ id }));
let animations;
let media;

function Harness({ items = products }) {
  const carousel = useProductCarousel(items, true);
  return (
    <div ref={carousel.carouselRef} {...carousel.carouselEvents}>
      <button onClick={() => carousel.move(1)}>Вперёд</button>
      <div ref={carousel.viewportRef} data-testid="viewport">
        <div ref={carousel.trackRef} style={{ columnGap: '14px' }}>
          {carousel.items.map((item) => (
            <div data-testid="slide" key={item.id}>
              {item.id}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  animations = [];
  media = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', () => media);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        this.callback([{ isIntersecting: true, intersectionRatio: 1 }]);
      }
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
  });
  Element.prototype.animate = vi.fn(() => {
    let resolve;
    const animation = {
      finished: new Promise((done) => {
        resolve = done;
      }),
      cancel: vi.fn(),
      complete: () => resolve(),
    };
    animations.push(animation);
    return animation;
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete Element.prototype.animate;
});

const first = () => screen.getAllByTestId('slide')[0].textContent;
const advance = (ms) => act(() => vi.advanceTimersByTime(ms));

describe('product carousel lifecycle', () => {
  it('does not rotate a list that fits entirely in the viewport', () => {
    render(<Harness items={products.slice(0, 2)} />);
    advance(10000);
    fireEvent.click(screen.getByText('Вперёд'));
    expect(animations).toHaveLength(0);
    expect(first()).toBe('0');
  });

  it('waits a full interval after returning from a hidden tab', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    render(<Harness />);
    advance(3000);
    hidden.mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    advance(10000);
    expect(animations).toHaveLength(0);
    hidden.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    advance(3999);
    expect(animations).toHaveLength(0);
    advance(1);
    expect(animations).toHaveLength(1);
  });

  it('commits a move only when animation finishes and ignores overlapping clicks', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Вперёд'));
    fireEvent.click(screen.getByText('Вперёд'));
    expect(animations).toHaveLength(1);
    advance(2000);
    expect(first()).toBe('0');
    await act(async () => animations[0].complete());
    expect(first()).toBe('1');
    expect(animations[0].cancel).toHaveBeenCalled();
  });

  it('pauses for card focus and restarts with a full delay after focusing an arrow', async () => {
    render(<Harness />);
    fireEvent.focus(screen.getAllByTestId('slide')[0]);
    advance(10000);
    expect(animations).toHaveLength(0);
    fireEvent.focus(screen.getByText('Вперёд'));
    advance(3999);
    expect(animations).toHaveLength(0);
    advance(1);
    expect(animations).toHaveLength(1);
    await act(async () => animations[0].complete());
    expect(first()).toBe('1');
  });

  it('starts a fresh interval after a manual move completes', async () => {
    render(<Harness />);
    advance(3000);
    fireEvent.click(screen.getByText('Вперёд'));
    await act(async () => animations[0].complete());
    expect(first()).toBe('1');
    advance(3999);
    expect(animations).toHaveLength(1);
    advance(1);
    expect(animations).toHaveLength(2);
  });

  it('cancels obsolete animation when products change', async () => {
    const { rerender, unmount } = render(<Harness />);
    fireEvent.click(screen.getByText('Вперёд'));
    const pending = animations[0];
    rerender(<Harness items={products.slice(2)} />);
    expect(pending.cancel).toHaveBeenCalled();
    await act(async () => pending.complete());
    expect(first()).toBe('2');
    unmount();
    advance(10000);
    expect(animations).toHaveLength(1);
  });

  it('respects reduced motion and still permits immediate manual moves', () => {
    media.matches = true;
    render(<Harness />);
    advance(10000);
    expect(animations).toHaveLength(0);
    fireEvent.click(screen.getByText('Вперёд'));
    expect(first()).toBe('1');
    expect(animations).toHaveLength(0);
  });
});
