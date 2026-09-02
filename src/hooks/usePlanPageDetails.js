import { useState, useEffect } from 'react';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';

/**
 * Shared hook to load localized plan page details (trial / regular)
 * for subscription UI surfaces.
 *
 * It encapsulates the same logic used in SubscriptionScreen so we
 * don't duplicate the API call and selection logic in multiple places.
 */
export const usePlanPageDetails = () => {
  const { isGuestUser } = useAuth();
  const { isEligibleForSubscription } = useSubscription();
  const [planDetails, setPlanDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchPlanDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('---------------------------------getPlanPageDetails--------------------- ')

        const details = await API.getPlanPageDetails('en', 84);
        const defaults = details?.default;

        if (defaults) {
          let selected = null;

          if (defaults['73'] || defaults['74']) {
            const key = isEligibleForSubscription || isGuestUser ? '73' : '74';
            selected = defaults[key] || defaults['73'] || defaults['74'];
          } else {
            const firstKey = Object.keys(defaults)[0];
            selected = defaults[firstKey];
          }

          if (isMounted) {
            setPlanDetails(selected);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPlanDetails();

    return () => {
      isMounted = false;
    };
  }, [isEligibleForSubscription]);

  return { planDetails, loading, error };
};

