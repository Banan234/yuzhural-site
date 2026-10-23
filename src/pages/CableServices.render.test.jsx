// @vitest-environment jsdom
import '../test/renderTestSetup';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CableWeightPage from './CableWeightPage';
import CableShippingPage from './CableShippingPage';
import CableKnowledgePage from './CableKnowledgePage';
const mount = (component, path = '/') =>
  render(<MemoryRouter initialEntries={[path]}>{component}</MemoryRouter>);

describe('complete service flows', () => {
  it('saves separate cable rows, keeps their original mass and hands off the total', () => {
    mount(<CableWeightPage />, '/calculator/weight/');
    fireEvent.click(
      screen.getByRole('button', { name: 'Добавить позицию в расчёт' })
    );
    fireEvent.change(screen.getByLabelText(/^Длина, м/), {
      target: { value: '200' },
    });
    fireEvent.change(screen.getByLabelText('Данные изготовителя'), {
      target: { value: 'hka' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Добавить позицию в расчёт' })
    );
    expect(screen.getAllByRole('button', { name: /^удалить /i })).toHaveLength(
      2
    );
    expect(screen.getByText(/15–15,3/)).toBeInTheDocument();
    let detail;
    const listener = (event) => {
      detail = event.detail;
    };
    window.addEventListener('open-lead-modal', listener);
    fireEvent.click(
      screen.getByRole('button', { name: 'Проверить с менеджером' })
    );
    window.removeEventListener('open-lead-modal', listener);
    expect(detail.comment).toContain('15–15,3 кг');
    expect(detail.comment).toContain('100 м');
    expect(detail.comment).toContain('200 м');
  });
  it('does not calculate an arbitrary default cable when arriving from a product', () => {
    mount(
      <CableWeightPage />,
      '/calculator/weight/?designation=UNKNOWN&length=250'
    );
    expect(screen.getByLabelText('Марка')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Добавить позицию в расчёт' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Скачать PDF' })).toBeDisabled();
  });
  it('restores saved rows when returning to the calculator and can clear them', () => {
    const first = mount(<CableWeightPage />, '/calculator/weight/');
    fireEvent.click(
      screen.getByRole('button', { name: 'Добавить позицию в расчёт' })
    );
    first.unmount();
    mount(<CableWeightPage />, '/calculator/weight/');
    expect(screen.getAllByRole('button', { name: /^удалить /i })).toHaveLength(
      1
    );
    fireEvent.click(screen.getByRole('button', { name: 'Очистить расчёт' }));
    expect(
      screen.queryByRole('button', { name: /^удалить /i })
    ).not.toBeInTheDocument();
  });
  it('shows telephone diameter units and identifies unknown suffixes', () => {
    mount(
      <CableKnowledgePage mode="marking" />,
      '/services/marking/?designation=ТППэп+10х2х0,5'
    );
    expect(
      screen.getByText(/10 пар.*2 жилы.*диаметр.*0[,.]5 мм/)
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Полное обозначение кабеля'), {
      target: { value: 'ВВГ-XYZ 3х2,5' },
    });
    expect(screen.getByText('-XYZ')).toBeInTheDocument();
  });
  it('prepares carrier totals without inventing a delivery tariff', () => {
    mount(<CableShippingPage />, '/services/shipping/');
    for (const [label, value] of [
      ['Длина, м', '1,2'],
      ['Ширина, м', '0,8'],
      ['Высота, м', '1'],
      ['Масса одного места, кг', '200'],
      ['Количество одинаковых мест', '4'],
    ]) {
      fireEvent.change(screen.getByLabelText(`${label}, место 1`), {
        target: { value },
      });
    }
    expect(screen.getByText('800')).toBeInTheDocument();
    expect(screen.getByText('3,84')).toBeInTheDocument();
    let detail;
    const listener = (event) => {
      detail = event.detail;
    };
    window.addEventListener('open-lead-modal', listener);
    fireEvent.click(
      screen.getByRole('button', { name: 'Запросить расчёт доставки' })
    );
    window.removeEventListener('open-lead-modal', listener);
    expect(detail.comment).toContain('800 кг брутто');
    expect(detail.comment).toContain('3,84 м³');
    expect(detail.comment).toContain('тарифам выбранной ТК');
  });
});
