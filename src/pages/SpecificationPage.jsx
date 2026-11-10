import { Navigate, useSearchParams } from 'react-router-dom';
export default function SpecificationPage() {
  const [params] = useSearchParams();
  return (
    <Navigate
      to="/"
      replace
      state={{
        openQuote: true,
        request: (params.get('request') || '').slice(0, 1000),
      }}
    />
  );
}
